# Easy-Feed Oven

This thing polls RSS/Atom feeds on the web and bakes up a nice personal
newspaper for me. Someday maybe it will do that for other folks too?
Who knows!

## Installation & Usage

* Hop onto a Linux machine.
  * I'm using Ubuntu.
  * Maybe Windows would work? I haven't tried yet.
* Get yourself an installation of [Node.js 14](nodejs) or better.
* Also install [Yarn](yarn).
* Check out or [download](download) the code here.
* Run `yarn install`
* Run `yarn run reset` to initialize the SQLite database form scratch.
* Maybe edit `sample.opml` to include your own RSS subscriptions.
  * That, or enjoy mine.
* Run `yarn run import-feeds` to import the feeds from `sample.opml`
* Run `yarn run poll` to fetch feeds from the web
* Run `yarn run build` to bake a personal newspaper in the `build/` directory
* If you have forked this to your own Github repository, `yarn run gh-pages` will deploy the build to your own Github Pages site associated with your fork.
* Rinse and repeat the last three steps for fresh news.
* Investigate the commands offered by `./index.js` for additional fun.

[download]: https://github.com/lmorchard/easy-feed-oven/archive/main.zip
[nodejs]: https://nodejs.org/en/download/current/
[yarn]: https://classic.yarnpkg.com/en/

## TODO

* Add a fixed-position top nav bar with intersection observer support to detect what's the top-most visible feed
  * Collapse feed, skip to next feed, what else?
* Maybe add some buttons to advance all feeds to a certain number of hours ago?
* Subscription editing would be nice from a web UI
  * Hard to do with a static site though
