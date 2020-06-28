exports.up = knex =>
  knex.schema.table("FeedItems", t => {
    t.boolean("new");
  });

exports.down = knex =>
  knex.schema.table("FeedItems", t => {
    t.dropColumn("new");
  });
