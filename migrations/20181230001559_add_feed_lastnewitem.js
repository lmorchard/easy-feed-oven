exports.up = knex =>
  knex.schema.table("Feeds", t => {
    t.datetime("lastNewItem");
  });

exports.down = knex =>
  knex.schema.table("Feeds", t => {
    t.dropColumn("lastNewItem");
  });
