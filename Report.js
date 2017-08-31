let fs = require('fs')
  , path = require('path')
  , util = require('./util.js')
  , _ = require('underscore')

let POSSIBLE_GRANURALITY = [1, 2, 5, 10, 30, 60, 120, 300, 600, 900];

class Report {
  constructor(options) {
    this.options = _.defaults(options, {
      dir: "results",
      minDatapoints: 30
    });
  }

  exportPromise() {
    return (testContext) => {
      let rawData = testContext.requests;
      let userFn = testContext.userFn;
      let testDuration = _.last(rawData).msFromStart/1000;
      var timeGranurality = _.chain(POSSIBLE_GRANURALITY)
        .reverse()
        .find(g => testDuration/g >= this.options.minDatapoints)
        .value() || 1;

      var reportBase = {};
      reportBase.req_s = _.chain(rawData)
        .countBy(e => Math.floor(e.msFromStart/(1000 * timeGranurality)))
        .mapObject((v,k) => v/timeGranurality)
        .value();
      reportBase.time = _.mapObject(reportBase.req_s, (value, key) => util.formatTime(1000 * key * timeGranurality))
      reportBase.users = _.mapObject(reportBase.time, (value, key) => Math.max(0, userFn(1000 * key * timeGranurality)))
      _.chain(rawData)
        .groupBy(e => e.name)
        .each((items, name) => {
          var preprocessed = _.chain(items)
            .groupBy((e => Math.floor(e.msFromStart/(1000 * timeGranurality))))
            .mapObject(group => _.filter(group, e => e.timing && e.timing.wait));
          reportBase[name+" Avg"] = preprocessed.mapObject(values => 
            _.chain(values).reduce((memo, num) => memo + parseFloat(num.timing.wait), 0).value() / values.length
          ).value();
          reportBase[name+" Max"] = preprocessed.mapObject(values =>
            _.chain(values).map(value=>parseFloat(value.timing.wait)).max().value()
          ).value();
        });
      let report = _.chain(util.invert(reportBase)).each((v,k)=>v.time_s=parseInt(k)).values().value();

      //TODO extract the preprocessing, it's very similar
      var transactionReportBase = {};
      transactionReportBase.req_s = _.chain(testContext.transactions)
        .countBy(t => Math.floor(t.startTime/(1000 * timeGranurality)))
        .mapObject((v,k) => v/timeGranurality)
        .value();
      transactionReportBase.time = _.mapObject(transactionReportBase.req_s, (value, key) => util.formatTime(1000 * key * timeGranurality))
      transactionReportBase.users = _.mapObject(transactionReportBase.time, (value, key) => Math.max(0, userFn(1000 * key * timeGranurality)))
      _.chain(testContext.transactions)
        .groupBy(e => e.name)
        .each((items, name) => {
          var preprocessed = _.chain(items)
            .groupBy((e => Math.floor(e.startTime/(1000 * timeGranurality))))
            .mapObject(group => _.filter(group, e => e.duration));
          transactionReportBase[name+" Avg"] = preprocessed.mapObject(values => 
            _.chain(values).reduce((memo, num) => memo + parseFloat(num.duration), 0).value() / values.length
          ).value();
          transactionReportBase[name+" Max"] = preprocessed.mapObject(values =>
            _.chain(values).map(value=>parseFloat(value.duration)).max().value()
          ).value();
        });
      let transactionsReport = _.chain(util.invert(transactionReportBase)).each((v,k)=>v.time_s=parseInt(k)).values().value();

      return Promise.resolve()
        .then(() => new Promise((resolve, reject) => {
          fs.mkdir(this.options.dir, (err) => {
            if (!err || err.code == "EEXIST") resolve(); else reject(err);
          });
        }))
        .then(() => Promise.all([
          new Promise((resolve, reject) => {
            let fpath = path.join(this.options.dir, "rawData.csv");
            let headers = 
            "Time from start [ms],Request name,Path,User #,Response code,Response bytes,Time send [ms],Time wait [ms], Time receive [ms], Time total [ms]";
            let dataArray = rawData.map((r) => 
              [r.msFromStart, r.name, r.path, r.user, r.statusCode, r.responseSize, r.timing.send, r.timing.wait, r.timing.recv, r.timing.total]);
            fs.writeFile(
              fpath, 
              [headers].concat(dataArray.map(row => row.join(','))).join('\n'),
              'utf8',
              (err) => {
                if (err) {
                  console.log(`Error exporting raw data to ${fpath}: ${err.message}`);
                  reject(err);
                } else {
                  console.log(`Exported raw data to ${fpath}`);
                  resolve();
                }
              }
            );
          }),
          new Promise((resolve, reject) => {
            let fpath = path.join(this.options.dir, "rawTransactions.csv");
            let headers = 
            "Start time [ms],Transaction name,User #,Duration [ms]";
            let dataArray = testContext.transactions.map((r) => 
              [r.startTime, r.name, r.user, r.duration]);
            fs.writeFile(
              fpath, 
              [headers].concat(dataArray.map(row => row.join(','))).join('\n'),
              'utf8',
              (err) => {
                if (err) {
                  console.log(`Error exporting raw data to ${fpath}: ${err.message}`);
                  reject(err);
                } else {
                  console.log(`Exported raw data to ${fpath}`);
                  resolve();
                }
              }
            );
          }),
          new Promise((resolve, reject) => {
            let fpath = path.join(this.options.dir, "requests.json");
            fs.writeFile(
              fpath, 
              JSON.stringify(report, null, 2),
              'utf8',
              (err) => {
                if (err) {
                  console.log(`Error exporting report to ${fpath}: ${err.message}`);
                  reject(err);
                } else {
                  console.log(`Exported report to ${fpath}`);
                  resolve();
                }
              }
            );
          }),
          new Promise((resolve, reject) => {
            let fpath = path.join(this.options.dir, "requests.csv");
            let basicKeys = ['time_s', 'time', 'req_s', 'users'];
            let dynKeys = Object.keys(reportBase).filter(k => basicKeys.indexOf(k) == -1);
            let header = "Time [s],Time,Requests per second,# of users," + dynKeys.join(",");
            fs.writeFile(
              fpath, 
              [header].concat(report.map(r => basicKeys.concat(dynKeys).map(k => r[k]))).join('\n'),
              'utf8',
              (err) => {
                if (err) {
                  console.log(`Error exporting report to ${fpath}: ${err.message}`);
                  reject(err);
                } else {
                  console.log(`Exported report to ${fpath}`);
                  resolve();
                }
              }
            );
          }),
          new Promise((resolve, reject) => {
            fs.createReadStream(path.join(__dirname, 'template', 'results.html'))
              .pipe(fs.createWriteStream(path.join(this.options.dir, "results.html")));
            let fpath = path.join(this.options.dir, "chartData.js");

            let basicKeys = ['time_s', 'time', 'req_s', 'users'];
            // let dynKeys = Object.keys(reportBase).filter(k => basicKeys.indexOf(k) == -1);

            let rpsData = {
              labels: _.pluck(report, 'time'),
              datasets: [{
                label: 'Requests per Second',
                data: _.pluck(report, 'req_s'),
                yAxisID: '1-s'
              }, {
                label: '# of Concurrent Users',
                data: _.pluck(report, 'users'),
                yAxisID: '1'
              }]
            };


            let rData = {
              labels: _.pluck(report, 'time'),
              datasets: [{
                label: '# of Concurrent Users',
                data: _.pluck(report, 'users'),
                yAxisID: '1'
              }]
            };

            Object.keys(reportBase).filter(k => basicKeys.indexOf(k) == -1).forEach(key => rData.datasets.push({
              label: key,
              data: _.pluck(report, key),
              yAxisID: 'ms'
            }))


            let tData = {
              labels: _.pluck(transactionsReport, 'time'),
              datasets: [{
                label: '# of Concurrent Users',
                data: _.pluck(transactionsReport, 'users'),
                yAxisID: '1'
              }]
            };

            Object.keys(transactionReportBase).filter(k => basicKeys.indexOf(k) == -1).forEach(key => tData.datasets.push({
              label: key,
              data: _.pluck(transactionsReport, key),
              yAxisID: 'ms'
            }))

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
    }
  }
}

module.exports = Report;