exports.up = knex =>
  knex.schema.table("FeedItems", t => {
    t.boolean("defunct");
  });

exports.down = knex =>
  knex.schema.table("FeedItems", t => {
    t.dropColumn("defunct");
  });
