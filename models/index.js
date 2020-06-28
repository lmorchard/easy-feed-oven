const knexfile = require("../knexfile");
const knex = require("knex")(knexfile.development);

const { Model } = require("objection");
Model.knex(knex);

const BaseModel = require("./BaseModel");
const Feed = require("./Feed");
const FeedItem = require("./FeedItem");

// TODO: knex setup should probably live here, too
async function setupModels({ config }) {
  BaseModel.config(config);
  return module.exports;
}

module.exports = {
  setupModels,
  knex,
  BaseModel,
  Feed,
  FeedItem,
};
