const { Model } = require("objection");
const guid = require("objection-guid")();
const { DbErrors, UniqueViolationError } = require("objection-db-errors");
const { mapFn } = require("../lib");

let config = {};

class BaseModel extends DbErrors(Model) {
  static config() {
    if (arguments.length) {
      config = arguments[0];
    } else {
      return config;
    }
  }

  static get relatedFindQueryMutates() {
    return false;
  }

  static get jsonAttributes() {
    return ["json"];
  }

  $beforeInsert() {
    this.created_at = new Date().toISOString();
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }

  static async insertOrUpdate(attrs, { log }) {
    const uniqueAttrs = mapFn(this.uniqueAttributes, name => attrs[name]);
    let model;
    try {
      model = await this.query().insert(attrs);
      log.debug("Inserted model %s", JSON.stringify(uniqueAttrs));
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        // HACK: Only try an update on an insert failed on constraint
        await this.query()
          .where(uniqueAttrs)
          .patch(attrs);
        model = await this.query()
          .where(uniqueAttrs)
          .first();
        log.debug("Updated model %s", JSON.stringify(uniqueAttrs));
      } else {
        throw err;
      }
    }
    return model;
  }
}

module.exports = BaseModel;
