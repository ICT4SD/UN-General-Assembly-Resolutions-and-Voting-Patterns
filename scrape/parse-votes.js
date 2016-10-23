// Parses and saves the voting data from the raw HTML pages.
//
// After the records have been scraped using scrape-votes.js, this script will parse the html
// and store the result in both MongoDB and in a CSV file.

const MongoClient = require('mongodb').MongoClient
, $ = require('cheerio')
, fs = require('fs')
, async = require('async')
, inDir = 'data/scraped-voting-pages/'
, outFilePath = 'data/votes-segmented.csv'
, mongoUri = 'mongodb://localhost:27017/un_voting'
, mongoCollection = 'votes-segmented'
, concurrency = 16
;

let db = null // set on initialization
, csvKeys = {} // maintains an ordered list of the unique keys found
, csvKeysFound = 0
, outFile = null
;

function filterKey(key) {
    return key.toLowerCase().replace(/\s/g, '_');
}

function processVotingCell(data, voteCell) {
    voteCell.find('a').each((index, rawElem) => {
        let line = $(rawElem).text();
        let match = line.match(/^([RP]\s)?(.)\s(.*)$/i);
        if (match) {
            data[filterKey(match[3])] = match[2];
        } else {
            data[filterKey(line)] = ''; // Signifies no response.
        }
    });
}

// Returns true if error
function extractData(body) {
    let data = {};
    let keys = $(body).find("form[name=full] td[width='1%']");
    if (keys.length == 0) {
        console.log("NO keys");
        return data;
    }
    keys.each((index, rawElem) => {
        let elem = $(rawElem);
        let key = elem.text().slice(0, -2); // remove trailing space and colon.
        key = filterKey(key);
        let value = elem.parent().find('td:nth-child(2)');
        let anchors = value.find('a[href^=http]');

        if (key == 'detailed_voting') {
            processVotingCell(data, value);
            return;
        }

        if (key == 'related_document') {
            let text = value.text();
            // This may have multiple lines.
            let lines = value.find('.normalBlackFont1');
            if (lines.length > 1) {
                let lineArray = [];
                lines.each((index, rawElem) => { lineArray.push($(rawElem).text()); });
                text = lineArray.join(" and "); // Consistent with rest of data.
            }
            data[key] = text;
            return;
        }
        
        if (key == 'link_to') {
            // Multiple links, one may have the english link.
            let eng = null;
            anchors.each((index, rawElem) => {
                if ($(rawElem).text() == 'English') eng = $(rawElem);
            });
            if (eng) data[key + '_link'] = eng.attr('href');
            return;
        }
        
        // Rest of fields are either just text or links.
        if (anchors.length > 0) {
            let anchorTextList = [], anchorLinkList = [];
            anchors.each((index, rawElem) => { 
                let el = $(rawElem);
                anchorTextList.push(el.text());
                anchorLinkList.push(el.attr('href'));
            });
            data[key] = anchorTextList.join(' ! '); // Arbitrary delimitter.
            data[key + '_link'] = anchorLinkList.join(' ');
            return;
        }

        // Else assume text node.
        data[key] = value.text();
    });

    return data;
}

function processPage(body, taskCallback) {
    let data = extractData(body);
    let csvLine = [];
    for (let prop in data) {
        if (!data.hasOwnProperty(prop)) continue;
        if (!csvKeys.hasOwnProperty(prop)) csvKeys[prop] = csvKeysFound++;
        csvLine[csvKeys[prop]] = data[prop];
    }
    outFile.write(csvLine.join("\t") + "\n", 'utf-8');
    db.collection(mongoCollection).insert(data, null, taskCallback);
}

function scrape(files, callback) {
    let startTime = Date.now();

    let taskQueue = async.queue((file, taskCallback) => {
        console.log('Processing', inDir + file);
        fs.readFile(inDir + file, { encoding: 'utf-8' }, (err, contents) => {
            if (err) taskCallback(err);
            else processPage(contents, taskCallback);
        });
    }, concurrency);

    taskQueue.drain = () => {
        console.log('Finished, took ' + ((Date.now() - startTime) / 1000) + 's');
        console.log('The CSV heading heys are as follows:');
        let csvHeader = "";
        function getProp(keyIndex) {
            for (prop in csvKeys) if (csvKeys[prop] == keyIndex) return prop;
            return undefined;
        }
        for (let i = 0; i < csvKeysFound; i++) csvHeader += getProp(i) + "\t";
        csvHeader = csvHeader.slice(0, -1)
        console.log(csvHeader);
        outFile.write(csvHeader);
        callback();
    };
    files.forEach((file) => { if (file.endsWith('.html')) taskQueue.push(file); })
}

MongoClient.connect(mongoUri, (err, mongoDb) => {
    if (err) throw err;
    db = mongoDb;
    db.collection(mongoCollection).count().then((count) => {
        if (count > 0) {
            console.error('Collection ' + mongoCollection + ' non-empty, exiting');
            process.exit(1);
        }
        let files = fs.readdirSync(inDir);
        outFile = fs.createWriteStream(outFilePath, { encoding: 'utf-8', flags: 'w' });
        scrape(files, () => { db.close(); outFile.end(); });
    });
});