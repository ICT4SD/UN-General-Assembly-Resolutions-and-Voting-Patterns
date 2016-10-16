// Used to scrape the individual vote pages after running scrape-records.js.
//
// The input of comes from the saved MongoDB records. The resulting HTML page will be saved locally
// in the data/scraped-voting-pages directory. Running on Windows 10 Laptop with core i7 and 8GB of
// RAM took about 20 minutes to scrape 8000 records.

const MongoClient = require('mongodb').MongoClient
, request = require('request')
, $ = require('cheerio')
, fs = require('fs')
, async = require('async')
, outDir = 'data/scraped-voting-pages/'
, mongoUri = 'mongodb://localhost:27017/un_voting'
, mongoCollection = 'voting_records'
, concurrency = 8
, maxRetry = 10
;

let db = null // set on initialization
, retryCount = {}
;

function savePage(record, body, taskCallback) {
    // Check if this page gave an error and we should retry.
    if ($(body).find("form[name=full] td[width='1%']").length == 0)
        taskCallback(true);
    else
        fs.writeFile(outDir + record['record_num'] + '.html', body, taskCallback);
}

function scrape(callback) {
    let startTime = Date.now();

    let retry = (record) => {
        let recordNum = record['record_num'];
        if (!retryCount[recordNum]) retryCount[recordNum] = 1;
        if (retryCount[recordNum] < maxRetry) {
            console.log('Retrying scrape for record: ' + recordNum);
            retryCount[recordNum]++;
            taskQueue.unshift(record);
        } else {
            console.error('Max retry hit for record: ' + recordNum);
        }
    }

    let taskQueue = async.queue((record, taskCallback) => {
        request(record['un_resolution_symbol_link'], (err, resp, body) => {
            if (err) {
                retry(record);
                taskCallback();
                return;
            }
            savePage(record, body, (err) => {
                if (err) retry(record);
                taskCallback();
            });
        });
    }, concurrency);

    taskQueue.drain = () => {
        console.log('Finished, took ' + ((Date.now() - startTime) / 1000) + 's');
        console.log('HTML files are in ' + outDir);
        callback();
    };

    // If you want to simply test it on one record, add a limit here.
    db.collection(mongoCollection).find({}).forEach((record) => { taskQueue.push(record); });
}

MongoClient.connect(mongoUri, (err, mongoDb) => {
    if (err) throw err;
    db = mongoDb;
    db.collection(mongoCollection).count().then((count) => {
        if (count < 0) {
            console.log('Collection ' + mongoCollection + ' has no records');
            process.exit(1);
        }
        console.log('Going to scrape ' + count + ' records');
        scrape(() => { db.close(); });
    });
});