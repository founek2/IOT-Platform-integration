import { j2xParser as Parser } from 'npm:fast-xml-parser@3.21.1'
// const Parser = require('fast-xml-parser').j2xParser;
const parser = new Parser({
  attributeNamePrefix: '@',
  ignoreAttributes: false
});

function getData(data) {
  if (!data) {
    return {};
  }

  return Object.keys(data).reduce((a, name) => {
    const value = data[name];
    if (value !== undefined) {
      a[name] = (value === null) ? '' : value.toString();
    }

    return a;
  }, {});
}

export function createSOAPAction(service, actionName, data) {
  const envelope = {
    's:Envelope': {
      '@xmlns:s': 'http://schemas.xmlsoap.org/soap/envelope/',
      '@s:encodingStyle': 'http://schemas.xmlsoap.org/soap/encoding/',
      's:Body': {
        [`u:${actionName}`]: {
          '@xmlns:u': service.serviceType,
          ...getData(data)
        }
      }
    }
  }

  return parser.parse(envelope);
}

export default {
  createSOAPAction
}

