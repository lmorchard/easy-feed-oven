module.exports = {
  development: {
    debug: false,
    client: "sqlite3",
    connection: {
      filename: "./data/sqlite.db",
    },
    useNullAsDefault: true,
  },
};
