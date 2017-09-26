let fs = require('fs')
  , path = require('path')
  , util = require('./util.js')
  , _ = require('underscore')

let POSSIBLE_GRANURALITY = [1, 2, 5, 10, 30, 60, 120, 300, 600, 900];

function _arrs(container, reqName, names) {
  if (!container[reqName + " Count"]) {
    container[reqName + " Count"] = [];
    container[reqName + " Avg"] = [];
    container[reqName + " Max"] = [];
    names.add(reqName)
  }
  return [
    container[reqName + " Count"],
    container[reqName + " Avg"],
    container[reqName + " Max"]
  ]
}

function processStore(store, timeGranurality) {
  return new Promise((resolve, reject) => {
    let reportBase = {
      req_s: []
    };

    let names = new Set();

    store
      .read()
      .on("data", data => {
        // console.log(data)
        if (data && data.name && (data['timing.wait'] || data.duration)) {
          var k = Math.floor(data.startTime/(1000 * timeGranurality));
          if (!reportBase.req_s[k]) reportBase.req_s[k] = 0;
          reportBase.req_s[k] += 1.0/timeGranurality;
          var [counts, avg, max] = _arrs(reportBase, data.name, names);
          var time = parseFloat(data['timing.wait'] || data.duration);
          avg[k] = (((counts[k] || 0) * (avg[k] || 0) * timeGranurality) + time) / (((counts[k] || 0) * timeGranurality) + 1);
          max[k] = Math.max(max[k] || 0, time);
          counts[k] = (counts[k] || 0) + 1.0/timeGranurality;
        }
        // console.log(data);
      })
      .on("end", () => {
         // console.log(reportBase.req_s);
         resolve([reportBase, names]);
      })
  })
}

class Report {
  constructor(options) {
    this.options = _.defaults(options, {
      dir: "results",
      minDatapoints: 30
    });
  }

  exportPromise() {
    let self = this;
    return (testContext) => {

      let userFn = testContext.userFn;
      let testDuration = testContext.totalDuration / 1000;
      let timeGranurality = _.chain(POSSIBLE_GRANURALITY)
        .reverse()
        .find(g => testDuration/g >= self.options.minDatapoints)
        .value() || 1;

      return Promise.all([
        processStore(testContext.configuration.requestStore, timeGranurality),
        processStore(testContext.configuration.transactionStore, timeGranurality)
      ]).then((results) => new Promise((resolve, reject) => {
        var time = _.range(Math.ceil(testContext.totalDuration / (1000 * timeGranurality))).map(i => util.formatTime(1000 * i * timeGranurality));
        var users = 
          _.range(Math.ceil(testContext.totalDuration / (1000 * timeGranurality)))
            .map(i => {
              var users = userFn(1000 * i * timeGranurality);
              var totalUsers = (users === -1 ? 0 : users.reduce((memo, num) => memo + num, 0));
              return Math.max(0, totalUsers);
            });

        var requests = [];
        var transactions = [];
        time.forEach((t, i) => {
          requests[i] = {};
          transactions[i] = {};

          requests[i].time = transactions[i].time = t;
          requests[i].users = transactions[i].users = users[i];

          for (var k in results[0][0]) requests[i][k] = results[0][0][k][i];
          for (var k in results[1][0]) transactions[i][k == "req_s" ? "transactions_s" : k] = results[1][0][k][i];
        });

        resolve([requests, results[0][1], transactions, results[1][1]]);
      })).then(([requests, [...requestNames], transactions, [...transactionNames]]) => Promise.all([

        Promise.resolve({
          requests: requests,
          requestNames: requestNames,
          transactions: transactions,
          transactionNames: transactionNames
        }),

        new Promise((resolve, reject) => {


          fs.createReadStream(path.join(__dirname, 'template', 'results.html'))
            .pipe(fs.createWriteStream(path.join(this.options.dir, "results.html")));
          let fpath = path.join(this.options.dir, "chartData.js");

          let rpsData = {
            labels: _.pluck(requests, 'time'),
            datasets: [{
              label: '# of Concurrent Users',
              data: _.pluck(requests, 'users'),
              yAxisID: '1',
              borderDash: [5, 5]
            }, {
              label: 'Requests per Second',
              data: _.pluck(requests, 'req_s'),
              yAxisID: '1-s'
            }]
          };


          let rData = {
            labels: _.pluck(requests, 'time'),
            datasets: [{
              label: '# of Concurrent Users',
              data: _.pluck(requests, 'users'),
              yAxisID: '1',
              borderDash: [5, 5]
            }]
          };

          requestNames.forEach(key => rData.datasets.push(
            { label: key + " Avg", data: _.pluck(requests, key + " Avg"), yAxisID: 'ms'},
            { label: key + " Max", data: _.pluck(requests, key + " Max"), yAxisID: 'ms'}
          ));

          let tData = {
            labels: _.pluck(transactions, 'time'),
            datasets: [{
              label: '# of Concurrent Users',
              data: _.pluck(transactions, 'users'),
              yAxisID: '1',
              borderDash: [5, 5]
            }]
          };

          transactionNames.forEach(key => tData.datasets.push(
            { label: key + " Avg", data: _.pluck(transactions, key + " Avg"), yAxisID: 'ms'},
            { label: key + " Max", data: _.pluck(transactions, key + " Max"), yAxisID: 'ms'}
          ));

          let chartOptions = {
              yAxes: [
              { id: "1-s", position: 'left' },
              { id: "1", position: 'left' },
              { id: "ms", position: 'right' }
            ]
          };

          fs.writeFile(
            fpath, 
            `let results = {\n type: 'line', options: ${JSON.stringify(chartOptions, null, 2)},\n rpsData: ${JSON.stringify(rpsData, null, 2)},\n rData: ${JSON.stringify(rData, null, 2)},\n tData: ${JSON.stringify(tData, null, 2)}\n};`,
            'utf8',
            (err) => {
              if (err) {
                console.log(`Error exporting chart data to ${fpath}: ${err.message}`);
                reject(err);
              } else {
                console.log(`Exported chart data to ${fpath}`);
                resolve();
              }
            }
          );
        })
      ]))
      .then(preprocessed => new Promise((resolve, reject) => resolve(preprocessed)));
    }
  }
}

module.exports = Report;