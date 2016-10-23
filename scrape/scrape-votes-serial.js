// Used to scrape the individual vote pages after running scrape-records.js. 
//
// WARNING: This file is deprecated, but included since out-of-memory errors were being experienced 
// with scrape-votes.js. This file is significantly slower than scrape-votes.js, only use if needed.
//

const MongoClient = require('mongodb').MongoClient
, request = require('request')
, $ = require('cheerio')
, fs = require('fs')
, async = require('async')
, outDir = 'data/scraped-voting-pages/'
, mongoUri = 'mongodb://localhost:27017/un_voting'
, mongoCollection = 'voting_records_segmented'
, concurrency = 8
, maxRetry = 10
;

let db = null // set on initialization
, retryCount = {}
, count = 0
;

function savePage(record, body, taskCallback) {
    // Check if this page gave an error and we should retry.
    if ($(body).find("form[name=full] td[width='1%']").length == 0)
        taskCallback(true);
    else
        fs.writeFile(outDir + record['record_num'] + '.html', body, taskCallback);
    count++;
    if (count % 50 == 0) console.log(count + " completed");
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
        
       
    }, concurrency);

    taskQueue.drain = () => {
        console.log('Finished, took ' + ((Date.now() - startTime) / 1000) + 's');
        console.log('HTML files are in ' + outDir);
        callback();
    };

    // This pipline groups by the resolution symbol to remove duplicates.
    let pipeline = [{$group: {_id: '$un_resolution_symbol', record: {$first: '$$ROOT'}}}];
    // If you want to simply test it on one record, add a limit here.
    let cursor = db.collection(mongoCollection).aggregate(pipeline);
    function process(record, taskCallback) {
        if (fs.existsSync(outDir + record['record_num'] + '.html')) {
            console.log('Ignoring ' + record['record_num']);
            taskCallback();
            return;
        }
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
    }

    function processIterate() {
        cursor.next().then((record) => {
            if (record == null) {
                console.log('Finished, took ' + ((Date.now() - startTime) / 1000) + 's');
                callback();
            }
            process(record['record'], processIterate);
        });
    }
    processIterate();
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