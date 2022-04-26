# easy-feed-oven

A toaster oven for personal newspapers 

## todo

- [x] store separate meta and items JSON for each feed
- [ ] store fetch error info into meta JSON
- [ ] build explicit model processing to massage feed parse output into consistent JSON?
- [ ] find a way to paginate items into multiple smaller JSON files where older historical files tend not to be modified?
  - segment by count, name by timestamp
  - each page with a pointer to next
  - pointer to head in meta, list of pages in meta
  - still offer ability to purge ancient items from older pages
  - not rotation, more like start timestamp trail
    - items-2022-04-26-110523-1.json
    - items-2022-04-26-110523-2.json
    - items-2022-04-26-110523-3.json
    - items-2022-04-26-111500-1.json
    - YYYY-mm-dd-HHMMSS-{count}.json
