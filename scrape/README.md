These scripts are responsible for scraping the voting data from the 
[UNBISNET voting record search](http://unbisnet.un.org:8080/ipac20/ipac.jsp?profile=voting&menu=search).
These scripts are organized as follows:
- <b>scrape-records.js</b> scrapes the record listings from the search result pages.
- <b>scrape-votes.js</b> scrapes each individual vote page and saves them as HTML files.
- <b>parse-votes.js</b> parses the HTML files and saves the data in MongoDB and CSV.

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