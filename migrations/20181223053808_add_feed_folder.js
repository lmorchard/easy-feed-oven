exports.up = knex =>
  knex.schema.table("Feeds", t => {
    t.string("folder");
  });

exports.down = knex =>
  knex.schema.table("Feeds", t => {
    t.dropColumn("folder");
  });
