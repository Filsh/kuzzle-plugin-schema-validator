const resolve = require('path').resolve;
const Joi = require('joi');
const Pipes = require('./pipes');
const pluginName = require('../package.json').name;


class SchemaValidator {
  get pipes() {
    return Pipes;
  }

  init(config, pluginContext) {
    this.pluginContext = pluginContext;
    this.errors = pluginContext.errors;
    this.schemas = loadAllSchemas(config.schemas);
  }

  validate(request, next) {
    const collection = request.collection;

    const schemaConfig = this.schemas[collection];
    if (!isSchemaActive(schemaConfig)) {
      return next(null, request);
    }

    const schema = schemaConfig.schema;
    const getContext = schema.getContext || Promise.resolve();

    getContext(request, this.pluginContext)
      .then(context => {
        const options = Object.assign({}, schemaConfig.options);
        options.context = Object.assign({}, options.context, context);

        let {error, value} = Joi.validate(request.data.body, schema, options);
        if (error) {
          throw pluginError(error.message, this.errors.BadRequestError);
        }

        request.data.body = value;
        return request;
      })
      .then(request => next(null, request))
      .catch(error => {
        error = error instanceof this.errors.KuzzleError
          ? error
          : pluginError(error.message, this.errors.InternalError);

        next(error, request);
      });
  }
}


function loadAllSchemas(schemas) {
  schemas = Object.assign({}, schemas);
  const workingDir = process.cwd();

  for (const collection in schemas) {
    const schemaConfig = schemas[collection];
    if (!isSchemaActive(schemaConfig)) continue;

    const schema = loadSchema(collection, workingDir, schemaConfig.path);
    schemaConfig.schema = schema;
  }

  return schemas;
}

function isSchemaActive(schemaConfig) {
  return schemaConfig && schemaConfig.activated !== false;
}

function loadSchema(collection, workingDir, path) {
  path = resolve(workingDir, path);
  try {
    return require(path);
  } catch (error) {
    throw pluginError(
      `loading '${collection}' schema from '${path}' failed: ${error.message}`
    );
  }
}

function pluginError(message, Type=Error) {
  return new Type(`${pluginName}: ${message}`);
}


module.exports = SchemaValidator;
