// Used to scrape the the document associated with each resolution.
//
// The input of comes from the saved MongoDB records. The resulting JSON page will be saved locally
// in the data/scraped-docs directory. Running on Windows 10 Laptop with core i7 and 8GB of
// RAM took about 20 minutes to scrape 8000 records.

const MongoClient = require('mongodb').MongoClient
, request = require('request')
, $ = require('cheerio')
, fs = require('fs')
, async = require('async')
, outDir = 'data/scraped-docs/'
, mongoUri = 'mongodb://localhost:27017/un_voting'
, mongoCollection = 'voting_records_segmented'
, concurrency = 8
, maxRetry = 10
;

let db = null // set on initialization
, retryCount = {}
, count = 0
, concatenatedFile = null
;

function savePage(symbol, body, taskCallback) {
    const prefixLength = ("json default").length;
    let cleanedSymbol = symbol.replace(/\//ig, '_');
    let cleanedBody = body.substring(prefixLength);

    fs.writeFile(outDir + cleanedSymbol + '.json', cleanedBody, taskCallback);
    if (count > 0) concatenatedFile.write(',');
    concatenatedFile.write(cleanedBody);
    count++;
    if (count % 50 == 0) console.log(count + " completed");
}

function scrape(callback) {
    let startTime = Date.now();
    concatenatedFile.write("[");
    let first = true;

    let retry = (symbol) => {
        if (!retryCount[symbol]) retryCount[symbol] = 1;
        if (retryCount[symbol] < maxRetry) {
            console.log('Retrying scrape for symbol: ' + symbol);
            retryCount[symbol]++;
            taskQueue.unshift(symbol);
        } else {
            console.error('Max retry hit for symbol: ' + symbol);
        }
    }

    let taskQueue = async.queue((symbol, taskCallback) => {
        let url = 'https://search.un.org/api.php?tpl=ods&query=symbol:"' + symbol + '"&fq=languageCode:en';
        request(url, (err, resp, body) => {
            if (err) {
                retry(symbol);
                taskCallback();
                return;
            }
            savePage(symbol, body, (err) => {
                if (err) retry(symbol);
                taskCallback();
            });
        });
    }, concurrency);

    taskQueue.drain = () => {
        console.log('Finished, took ' + ((Date.now() - startTime) / 1000) + 's');
        console.log('JSON files are in ' + outDir);
        concatenatedFile.write("]");
        callback();
    };

    // This pipline groups by the resolution symbol to remove duplicates.
    let pipeline = [{$group: {_id: '$un_resolution_symbol', record: {$first: '$$ROOT'}}}, {$limit: 100}];
    // If you want to simply test it on one record, add a limit here.
    db.collection(mongoCollection).aggregate(pipeline).each((err, doc) => {
        if (err) throw err;
        if (doc == null) return;
        taskQueue.push(doc['record']['un_resolution_symbol']);
    });
}

MongoClient.connect(mongoUri, (err, mongoDb) => {
    if (err) throw err;
    db = mongoDb;
    concatenatedFile = fs.createWriteStream(outDir + 'concatenated.json');
    db.collection(mongoCollection).count().then((count) => {
        if (count < 0) {
            console.log('Collection ' + mongoCollection + ' has no records');
            process.exit(1);
        }
        console.log('Going to scrape ' + count + ' records');
        scrape(() => { 
            db.close();
            concatenatedFile.close();
        });
    });
});