let _ = require('underscore')
  , http = require("http")
  , util = require('./util.js')

class User {
  constructor(num, testContext) {
    this.agent = new http.Agent({keepAlive: true});
    this.num = num;
    this.testContext = testContext;
  }

  reinit() {
    this.jar = new Map();
    this.vuStarted = process.hrtime();
    this.context = {  };
  }

  destroy() {
    this.agent.destroy();
  }

  _request(method, name, path, data, options) {
    var self = this;
    path = new Function("return `"+path+"`;").call(self.context);
    var processResponse = _.has(options,'processResponse') ? options.processResponse : true;

    return () => new Promise((resolve) => {
      var httpOptions = _.extend({
        protocol: 'http:',
        // host: host,
        port: 80,
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

      var request = http.request(httpOptions);
      var responseBody = '';

      request.on('error', (e) => {
        logEntry.status = 'error';
        logEntry.error = e.message;
        // if (logEntryId) logCollection.replaceOne({_id:logEntryId}, logEntry);
        resolve();
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
          if (processResponse) resolve(responseBody); else resolve();
        });
        res.on('error', () => {
          logEntry.hrTime.finish = process.hrtime(logEntry.hrTime.init);
          logEntry.status = 'error';
          // if (logEntryId) logCollection.replaceOne({_id:logEntryId}, logEntry);
          if (processResponse) resolve(responseBody); else resolve();
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

  wait(seconds) {
    return () => new Promise((resolve, reject) => setTimeout(resolve, seconds*1000));//*WAIT_MULTIPLIER);
  }
}

class TestContext {
  constructor(scenario, configuration, rampup) {
    this.scenario = scenario;
    this.configuration = configuration;
    this.rampup = rampup;
    this.requests = [];
    this.users = [];

    this.rampupArray = _.chain(rampup).pairs().map(pair => [parseFloat(pair[0]), pair[1]]).value();
    this.userFn = ms => {
      var s = ms/1000;
      var min = s / 60;
      for (var i=0; i<this.rampupArray.length-1; i++) {
        if (this.rampupArray[i][0] <= min && this.rampupArray[i+1][0] > min) {
          return Math.floor(this.rampupArray[i][1] 
            + (this.rampupArray[i+1][1]-this.rampupArray[i][1])
              * ((min-this.rampupArray[i][0])/(this.rampupArray[i+1][0]-this.rampupArray[i][0])))
        }
      }
      return -1;
    };
  }

  run() {
    this.startTime = Date.now();

    var interval = setInterval(() => {
      var time = Date.now() - this.startTime;
      var desiredUsers = this.userFn(time);
      util.log(this.rampup, this.users.length)
      if (desiredUsers > this.users.length) {
        this.startUser(this.users.length + 1, this.scenario);
      } else if (desiredUsers == -1) {
        clearInterval(interval);
      }
    }, 1000)

    return new Promise((resolve) => this.finalResoluton = resolve);
  }

  startUser(number, scenario) {
    var user = new User(number, this);
    this.users.push(user);

    this.runOrDestroy(user, scenario);
  }

  runOrDestroy(user, scenario) {
    if (this.users.length <= this.userFn(Date.now() - this.startTime)) {
      user.reinit();
      scenario(user).then(() => this.runOrDestroy(user, scenario));
    } else {
      user.destroy(); 
      this.users = _.without(this.users, user);
      util.log(this.rampup, this.users.length)
      if (this.users.length == 0) {
        this.finalResoluton(this.requests);
      }
    }
  }  
}

module.exports = User;