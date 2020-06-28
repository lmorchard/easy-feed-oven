const commonFields = t => {
  t.uuid("id").primary();
  t.timestamps();
  t.text("json");
};

exports.up = knex =>
  knex.schema
    .createTable("Feeds", t => {
      commonFields(t);
      t.boolean("disabled");
      t.string("resourceUrl")
        .index()
        .unique();
      t.string("title");
      t.string("subtitle");
      t.string("link");
      t.string("status");
      t.string("statusText");
      t.string("lastError");
      t.bigInteger("lastValidated");
      t.bigInteger("lastParsed");
    })
    .createTable("FeedItems", t => {
      commonFields(t);
      t.string("feed_id").references("Feeds.id");
      t.string("guid")
        .index()
        .unique();
      t.string("title");
      t.string("link");
      t.string("summary");
      t.string("date");
      t.string("pubdate");
    });

exports.down = knex => knex.schema.dropTable("Feeds").dropTable("FeedItems");
