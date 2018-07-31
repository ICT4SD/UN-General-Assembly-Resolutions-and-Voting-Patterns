// Used to scrape A/RES voting record listings from UNBISNET
//
// Resulting record listings are stored in a MongoDB collection. Running on Windows 10 Laptop with
// core i7 and 8GB of RAM took 6.5 minutes to scrape listings for 19796 records.
//
// Implementation Note:
// Since there is an 8000 record limit on search pages, we need to segment the search queries into
// result numbers of <= 8000 each.
//
// Using the year range filter we segment as follows:
// [0, 1970)    => 3278 records
// [1970, 1990) => 6053 records
// [1990, 2000) => 3961 records
// [2000, inf)  => 6504 records
//
// This sums to 19796, which is two less than the number of results without segmenting. This may be
// due to two records with malformed date fields. However, there are about 400 duplicate records
// found using this segmenting. This is filtered out in scrape-votes.js.

const $ = require('cheerio')
, request = require('request')
, async = require('async')
, MongoClient = require('mongodb').MongoClient
, mongoUri = 'mongodb://localhost:27017/un_voting'
, unbisnetUrl = 'http://unbisnet.un.org:8080/ipac20/ipac.jsp?&term=A%2FRES&profile=voting&index=.VM'
, mongoCollection = 'voting_records_segmented'
, npp = 50 // Number of results per page desired.
, yearSegments = [
    { lower: 0, upper: 1970, count: 3278 }, // Exclusive bounds.
    { lower: 1969, upper: 1990, count: 6053 },
    { lower: 1989, upper: 2000, count: 3961 },
    { lower: 2000, upper: 3000, count: 6504 }
    ]
, concurrency = 8
, fs = require('fs')
, maxRetry = 10
;

let db = null // Set on initialization.
, retryCount = {}
, uniqueRecordId = 1
, totalExpecting = yearSegments.reduce((sum, seg) => { return sum + seg.count;}, 0)
, totalRetrieved = 0
;

function addUrls(taskQueue) {
    yearSegments.forEach((segment) => {
        let numPages = Math.ceil(segment.count / npp);
        for (let page = 1; page <= numPages; page++) {
            url = unbisnetUrl + '&npp=' + npp + '&page=' + page
                + '&ultype=PD01&uloper=>&ullimit=' + segment.lower
                + '&ultype=PD01&uloper=<&ullimit=' + segment.upper;
            taskQueue.push(url)
        }
    });
}


function processPage(url, body, taskCallback) {
    let rawResults = $(body).find('center > .tableBackground > tr > form > td > .tableBackground');
    console.log('Processing page ' + url);
    if (rawResults.length == 0) {
        taskCallback(true);
        return;
    }
    let parsedResults = [];
    rawResults.each((index, rawElem) => {
        let elem = $(rawElem);
        let keys = elem.find('table > tr > td:nth-child(2) .boldBlackFont1');
        if (keys.length == 0) console.log('Malformed record: ' + (index+1) + ' on page ' + url);
        let record = { record_num : uniqueRecordId++ };
        keys.each((index, rawElem) => {
            let elem = $(rawElem);
            let key = elem.text().slice(0, -2); // remove trailing space and colon.
            key = key.toLowerCase().replace(/\s/g, '_');
            let value = elem.parent().parent().find('td:nth-child(2)');
            let anchors = value.find('a');
            if (anchors.length == 0) {
                // Text node.
                record[key] = value.text();
            } else if (anchors.length == 1) {
                record[key] = anchors.text();
                let href = anchors.attr('href');
                if (href.startsWith('javascript:')) {
                    href = href.slice(href.indexOf(',') + 2, -1 * "','true')".length);
                }
                href = decodeURIComponent(href);
                record[key + '_link'] = href; 
            } else {
                // Multiple links, one has the english link.
                let eng = null;
                anchors.each((index, rawElem) => {
                    if ($(rawElem).text() == 'English') eng = $(rawElem);
                });
                if (!eng) console.log((index+1), ' on page ', url, ' no english');
                else record[key + '_link'] = eng.attr('href');
            }
        });
        parsedResults.push(record);
    });
    db.collection(mongoCollection).insertMany(parsedResults, null, () => { taskCallback(); });
    totalRetrieved += parsedResults.length;
    console.log(totalRetrieved + '/' + totalExpecting + ' found');
}

function scrape(callback) {
    let startTime = Date.now();
    let retry = (url) => {
        if (!retryCount[url]) retryCount[url] = 1;
        if (retryCount[url] < maxRetry) {
            console.log('Retrying fetch for page ' + url);
            retryCount[url]++;
            taskQueue.unshift(url);
        } else {
            console.error('Max retry hit for page ' + url);
        }
    }
    let taskQueue = async.queue((url, taskCallback) => {
        request(url, (err, resp, body) => {
            if (err) {
                retry(url);
                taskCallback();
                return;
            }
            processPage(url, body, (err) => {
                if (err) retry(url);
                taskCallback();
            });
        });
    }, concurrency);

    taskQueue.drain = () => {
        console.log('Finished, took ' + ((Date.now() - startTime) / 1000) + 's');
        console.log('Records stored in MongoDB collection ' + mongoCollection);
        callback();
    };

    // Enqueue them all
    addUrls(taskQueue);
}

MongoClient.connect(mongoUri, (err, mongoDb) => {
    if (err) throw err;
    db = mongoDb.db("unbisnet");
    db.collection(mongoCollection).count().then((count) => {
        if (count > 0) {
            console.error('Warning, collection ' + mongoCollection + ' is not empty, exiting.');
            process.exit(1);
            return;
        }
        scrape(() => { mongoDb.close(); });
    });
});