# easy-feed-oven

A toaster oven for personal newspapers 

## todo

- [x] load & update pre-existing pages of items
- [ ] handle etag and last-modified for 301 responses
- [x] build an entrypoint index JSON mapping all feeds to meta.json's
  - include title, oldest / newest item dates?
- [ ] purge older item pages past a certain max age
- [ ] track when the last new item was seen for dynamic poll time increase
- [x] store separate meta and items JSON for each feed
- [x] build explicit model processing to massage feed parse output into consistent JSON?
- [x] find a way to paginate items into multiple smaller JSON files where older historical files tend not to be modified?
- [x] store fetch error info into meta JSON
