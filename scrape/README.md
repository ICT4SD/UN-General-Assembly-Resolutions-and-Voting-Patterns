These scripts are responsible for scraping the voting data from the 
[UNBISNET voting record search](http://unbisnet.un.org:8080/ipac20/ipac.jsp?profile=voting&menu=search).
These scripts are organized as follows:
- <b>scrape-records.js</b> scrapes the record listings from the search result pages.
- <b>scrape-votes.js</b> scrapes each individual vote page and saves them as HTML files.
- <b>parse-votes.js</b> parses the HTML files and saves the data in MongoDB and CSV.

Included in the data directory is the output of scraping and parsing the voting documents taken in
October 2016.
- <b>data/votes.csv</b> is a tab separated file with all of the parsed voting record data. This
includes resolutions adopted with and without vote.
- <b>data/scraped-voting-pages.zip</b> contains the raw HTML files scraped from unbisnet.un.org.
If you need to reparse the data it is highly recommended to use these HTML files instead of
scraping from unbisnet.un.org again, as that is significantly slower.

### Installation and Usage ###
You should have [NodeJS](https://nodejs.org/en/) v6.7 or higher as well as [MongoDB](https://www.mongodb.com/download-center) installed.
To install the NodeJS dependencies, in terminal run:
```
npm install
```

Then each of the corresponding scripts can be run (in order):
```
node scrape-records.js
node scrape-votes.js
node parse-votes.js
```

The resulting HTML pages and CSV data will be stored in the 'data' directory.

### Basic Usage ###
If you only need the raw data, download <b>data/votes.csv</b> from this repository. If you need
to reparse the HTML pages for the resolution records, unzip <b>data/scraped-voting-pages.zip</b>
and modify and run <b>parse-votes.js</b> with `node parse-votes.js`.

If you need to scrape the data from the live unbisnet.un.org website, then first run:
<b>scrape-records.js</b> followed by <b>scrape-votes.js</b>. Note, re-scraping should only be done 
up to date data is really necessary due to the additional time it takes.

### Data Format ###
The format of <b>data/votes.csv</b> roughly corresponds to the table displayed on voting record
pages ([example of page here](http://unbisnet.un.org:8080/ipac20/ipac.jsp?session=1B771818O5341.48875&profile=voting&uri=full=3100023~!476573~!0&ri=1&aspect=power&menu=search&source=~!horizon)).
Note, because some values are multi-line, some arbitrary delimitters have been chosen.
- <b>related_document</b> uses the word "and" as a delimitter between multiple values. This is
consistent with the format of other voting records.
- Fields with a link have a corresponding "\_link" field. E.g. the <b>agenda_information</b> field
has an <b>agenda_information_link</b> field with the value of the href attribute of the link.
- The <b>link_to</b> field only takes the English link if it is available.
- The text of multi-link values is delimitted with an exclamation point "!" and the links are 
delimitted with a space.
If different delimitters or format is desired, modify <b>parse-votes.js</b> and re-parse the
HTML files.