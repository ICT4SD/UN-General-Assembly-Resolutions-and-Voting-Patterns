// Used to scrape A/RES voting record listings from UNBISNET
//
// Resulting record listings are stored in a MongoDB collection. Running on Windows 10 Laptop with
// core i7 and 8GB of RAM took 93 seconds to scrape listings for 8000 records.

const $ = require('cheerio')
, request = require('request')
, async = require('async')
, MongoClient = require('mongodb').MongoClient
, mongoUri = 'mongodb://localhost:27017/un_voting'
, unbisnetUrl = 'http://unbisnet.un.org:8080/ipac20/ipac.jsp?&term=A%2FRES&profile=voting&index=.VM'
, mongoCollection = 'voting_records'
, npp = 50 // Number of results per page desired.
, concurrency = 8
, numPages = Math.ceil(8000 / npp) // 19787 should be real number, but 8000 seems to current limit.
, fs = require('fs')
, maxRetry = 10
;

let db = null // set on initialization
, retryCount = {} 
;


function processPage(pageNum, body, taskCallback) {
    let rawResults = $(body).find('center > .tableBackground > tr > form > td > .tableBackground');
    console.log("Processing page " + pageNum);
    if (rawResults.length == 0) {
        taskCallback(true);
        return;
    }
    let parsedResults = [];
    rawResults.each((index, rawElem) => {
        let elem = $(rawElem);
        let keys = elem.find('table > tr > td:nth-child(2) .boldBlackFont1');
        if (keys.length == 0) console.log('Malformed record: ' + (index+1) + ' on page ' + pageNum);
        let record = { record_num : npp * (pageNum-1) + index };
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
                if (!eng) console.log((index+1), ' on page ', pageNum, ' no english');
                else record[key + '_link'] = eng.attr('href');
            }
        });
        parsedResults.push(record);
    });
    db.collection(mongoCollection).insertMany(parsedResults, null, () => { taskCallback(); });
}

function scrape(callback) {
    let startTime = Date.now();
    let retry = (pageNum) => {
        if (!retryCount[pageNum]) retryCount[pageNum] = 1;
        if (retryCount[pageNum] < maxRetry) {
            console.log('Retrying fetch for page ' + pageNum);
            retryCount[pageNum]++;
            taskQueue.unshift(pageNum);
        } else {
            console.error('Max retry hit for page ' + pageNum);
        }
    }
    let taskQueue = async.queue((pageNum, taskCallback) => {
        request(unbisnetUrl + "&page=" + pageNum + "&npp=" + npp, (err, resp, body) => {
            if (err) {
                retry(pageNum);
                taskCallback();
                return;
            }
            processPage(pageNum, body, (err) => {
                if (err) retry(pageNum);
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
    for (let i = 1; i <= numPages; i++)  taskQueue.push(i);
}

MongoClient.connect(mongoUri, (err, mongoDb) => {
    if (err) throw err;
    db = mongoDb;
    db.collection(mongoCollection).count().then((count) => {
        if (count > 0) {
            console.error('Warning, collection ' + mongoCollection + ' is not empty, exiting.');
            process.exit(1);
            return;
        }
        scrape(() => { db.close(); });
    });
});