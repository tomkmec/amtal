let _ = require('underscore')
  , http = require("http")
  , https = require("https")
  , protocols = {'http:' : http, 'https:' : https}
  , util = require('./util.js')
  , TestContext = require('./TestContext.js')

class User {
  constructor(num, testContext) {
    this.agents = {
      'http:' : new http.Agent({keepAlive: true}),
      'https:' : new https.Agent({keepAlive: true})
    };
    this.num = num;
    this.testContext = testContext;
  }

  reinit() {
    this.jar = new Map();
    this.vuStarted = process.hrtime();
    this.context = {  };
    this.activeTransactions = {};
  }

  destroy() {
    this.agents['http:'].destroy();
    this.agents['https:'].destroy();
  }

  begin(name) {
    var self = this;
    return () => new Promise((resolve) => {
      self.activeTransactions[name] = {
        name: name,
        startTime: Date.now() - self.testContext.startTime,
        user: self.num
      }
      resolve();
    });
  }

  end(name) {
    var self = this;
    return () => new Promise((resolve) => {
      if (!!self.activeTransactions[name]) {
        var currentTime = Date.now() - self.testContext.startTime;
        var transaction = _.extend(self.activeTransactions[name], {
          endTime: currentTime,
          duration: currentTime - self.activeTransactions[name].startTime
        });
        self.testContext.transactions.push(transaction)
        this.publishTransaction(transaction)
      }
      resolve();
    });
  }

  publishRequest(req) {
    if (this.testContext.configuration.requestStore) {
      this.testContext.configuration.requestStore.store(req);
    }
  }

  publishTransaction(trans) {
    if (this.testContext.configuration.transactionStore) {
      this.testContext.configuration.transactionStore.store(trans);
    }
  }

  _request(method, name, path, data, options) {
    var self = this;

    return () => new Promise((resolve, reject) => {
      path = new Function("return `"+path+"`;").call(self.context);
      var processResponse = _.has(options,'processResponse') ? options.processResponse : true;

      var httpOptions = _.extend({
        protocol: 'http:',
        // host: host,
        // port: 80,
        method: method,
        path: path,
        headers: {}
      }, this.testContext.configuration.server, (options || {}).http);

      _.defaults(httpOptions.headers, {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.96 Safari/537.36',
        'Content-Type': "application/json"
      })
      httpOptions.headers.Cookie = // TODO join
        Array.from(self.jar.keys()).map((k) => `${k}=${self.jar.get(k)}`).join('; ');

      httpOptions.agent = self.agents[httpOptions.protocol];

      var logEntry = {
        status: 'fresh',
        name: name,
        path: path,
        user: self.num,
        hrTime: { init: process.hrtime() },
        msFromStart: Date.now() - this.testContext.startTime,
        responseSize: 0
      }
      // var logEntryId;

      this.testContext.requests.push(logEntry);
      // logCollection.insertOne(logEntry, (error, result) => logEntryId = result.insertedId)

      var request = protocols[httpOptions.protocol].request(httpOptions);
      var responseBody = '';

      request.on('error', (e) => {
        logEntry.status = 'error';
        logEntry.error = e.message;
        this.publishRequest(logEntry)
        // if (logEntryId) logCollection.replaceOne({_id:logEntryId}, logEntry);
        reject(e);
      });
      request.on('response', (res) => {
        logEntry.hrTime.firstResponse = process.hrtime(logEntry.hrTime.init);
        logEntry.status = 'receiving';
        logEntry.statusCode = res.statusCode;
        // if (logEntryId) logCollection.replaceOne({_id:logEntryId}, logEntry);
        (res.headers['set-cookie'] || []).forEach((c) => {
          var keyValue = c.split(';')[0].split('=');
          self.jar.set(keyValue[0],keyValue[1])
        });
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          logEntry.responseSize += chunk.length;
          if (processResponse) {
            responseBody += chunk.toString();
          }
        });
        res.on('end', () => {
          logEntry.hrTime.finish = process.hrtime(logEntry.hrTime.init);
          logEntry.timing = {
            send: util.ms(logEntry.hrTime.sent),
            wait: util.ms(logEntry.hrTime.firstResponse, logEntry.hrTime.sent),
            recv: util.ms(logEntry.hrTime.finish, logEntry.hrTime.firstResponse),
            total: util.ms(logEntry.hrTime.finish)
          }
          logEntry.status = 'closed';
          // if (logEntryId) logCollection.replaceOne({_id:logEntryId}, logEntry);
          this.publishRequest(logEntry);

          if (res.statusCode >= 300 && res.statusCode < 400) {
            reject(`Redirects are not supported yet! ${res.req.method} ${res.req.path} Status: ${res.statusCode}`);
          } else if (res.statusCode > 400 && res.statusCode != 401) {
            let statusMessage = res.statusMessage || http.STATUS_CODES[res.statusCode] || 'UNKNOWN';
            reject(`${res.req.method} ${res.req.path} [↔${util.ms(logEntry.hrTime.finish)}ms] `
              + `${res.statusCode} ${statusMessage}\n${responseBody}`);
          } else if (processResponse) {
            resolve(responseBody);
          } else {
            resolve();
          }
        });
        res.on('error', e => {
          logEntry.hrTime.finish = process.hrtime(logEntry.hrTime.init);
          logEntry.status = 'error';
          // if (logEntryId) logCollection.replaceOne({_id:logEntryId}, logEntry);
          this.publishRequest(logEntry)
          if (processResponse) reject(responseBody); else reject(e);
        });
      });

      if (data) request.write(data);

      request.end(null, null, () => {
        logEntry.status = 'sent';
        logEntry.hrTime.sent = process.hrtime(logEntry.hrTime.init);
        // if (logEntryId) logCollection.replaceOne({_id:logEntryId}, logEntry);
      });
    });
  }

  GET(name, path, processResponse = true) {
    return this._request('GET', name, path, null, processResponse)
  }

  POST(name, path, data, processResponse = true) {
    return this._request('POST', name, path, JSON.stringify(data), processResponse)
  }

  PUT(name, path, data, processResponse = true) {
    return this._request('PUT', name, path, JSON.stringify(data), processResponse)
  }

  wait(seconds) {
    return () => new Promise((resolve, reject) => setTimeout(resolve, seconds*1000));//*WAIT_MULTIPLIER);
  }
}

module.exports = User;
