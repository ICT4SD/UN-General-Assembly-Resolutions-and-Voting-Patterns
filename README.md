# UN-General-Assembly-Resolutions-and-Voting-Patterns
Textual Analytics and Visualization of the United Nations General Assembly Resolutions.

Objective
-------------
This project analyses text from thousands of UN official documents as well as GA voting records seeking for clusters by topics, voting similarity, etc. The project seeks to provide answers to these questions:

- What are the characteristics of General Assembly (GA) documents?

- How are they adopted by UN Member States?

Data sources
-------------
- All official UN documents are accessible at: https://search.un.org
    - A subset containing only GA resolutions (A/RES/..) with scraped text can be [downloaded here](https://github.com/ICT4SD/UN-General-Assembly-Resolutions-and-Voting-Patterns/raw/master/scrape/data/docs.json) in one JSON file.
    - The download above is also available as separate JSON documents (one per resolution) [here](https://github.com/ICT4SD/UN-General-Assembly-Resolutions-and-Voting-Patterns/raw/master/scrape/data/scraped-docs.zip).

- The official source of GA voting records is: http://unbisnet.un.org:8080/ipac20/ipac.jsp?profile=voting
    - The scraped HTML pages of GA voting records are available in a [zip file](https://github.com/ICT4SD/UN-General-Assembly-Resolutions-and-Voting-Patterns/raw/master/scrape/data/scraped-voting-pages.zip)
    - The GA voting records in CSV format can be [downloaded here](https://github.com/ICT4SD/UN-General-Assembly-Resolutions-and-Voting-Patterns/raw/master/scrape/data/votes.csv)
