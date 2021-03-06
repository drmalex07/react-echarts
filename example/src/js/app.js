'use strict';

var _ = require('lodash');
var moment = require('moment');
var path = require('path');
var express = require('express');
var logger = require('morgan');
var reqparser = require('body-parser');

var makeApp = function (appconfig) {

  var app = express();
  var docRoot = appconfig.docRoot;

  app.use(logger('combined'));

  docRoot.forEach((p) => {
    app.use(express.static(p, {maxAge: '1d'}));
  });

  app.use(reqparser.json()); // for parsing application/json

  app.get('/', function (req, res) {
    res.sendFile(path.join(docRoot[0], 'index.html'));
  });

  app.get('/api/action/echo', function (req, res) {
    res.json({message: (req.query.message || null)});
  });

  app.post('/api/action/echo', function (req, res) {
    res.json({message: (req.body.message || null)});
  });

  app.post('/api/action/query-stats', function (req, res) {
    var Granularity = require('./granularity.js');
    
    var q = _.extend({}, {
      source: 'water',
      metric: 'avg',
      granularity: 'day',
      timespan: 'week',
    }, req.body);
    
    var result, t0, t1, dt, granularity;
    
    switch (q.timespan) {
      case 'hour':
        // interpret as last hour
        t1 = moment(), t0 = t1.clone().add(-1, 'hour');
        break;
      case 'day':
        // interpret as current day
        t0 = moment().startOf('day'), t1 = t0.clone().add(1, 'day');
        break;
      case 'week':
        // interpret as current week
        t0 = moment().startOf('isoweek'), t1 = t0.clone().add(7, 'day');
        break;
      case 'month':
        // interpret as current month
        t0 = moment().startOf('month'), t1 = t0.clone().add(1, 'month');
        break;
      case 'year':
        // interpret as current year
        t0 = moment().startOf('year'), t1 = t0.clone().add(1, 'year');
        break;
      default:
        // interpret as a literal range
        t0 = moment(q.timespan[0]), t1 = moment(q.timespan[1]);
        break;
    }
    dt = t1 - t0; // millis

    granularity = Granularity.fromName(q.granularity);
    if (granularity == null) {
      result = {
        error: 'No such granularity: ' + q.granularity
      };
    } else if (granularity.valueOf() > dt) {
      result = {
        error: 'Too narrow timespan (' + moment.duration(dt).humanize() + ') for given granularity (' + q.granularity + ')',
      };
    } else {
      // Slide-down t0 to a closest multiple of granularity unit
      t0 = t0.startOf(granularity.unit)
      // Slide-up t1 to the closest multiple of granularity unit
      t1 = t1.endOf(granularity.unit).add(1, 'ms');
      // Compute number of data points
      dt = t1 - t0;
      let n = Math.ceil(dt / granularity.valueOf());
      let zeros = (new Array(n)).fill(0); 
      // Generate result!
      result = {
        error: null,
        request: {
          timespan: q.timespan,
          granularity: q.granularity,
        },
        result: {
          timespan: [t0.valueOf(), t1.valueOf()],
          granularity: q.granularity,
          // Mock an API response
          series: [
            {
              name: 'Group A',
              data: zeros.map((_zero, i) => (
                [
                  t0.clone().add(i * granularity.quantity, granularity.unit).valueOf(),
                  1.8 * i + 0.2 * i * i + (Math.random() - 0.5) * 1.5 + 15.0,
                ]
              )),
            },
            {
              name: 'Group B', 
              data: zeros.map((_zero, i) => (
                [
                  t0.clone().add(i * granularity.quantity, granularity.unit).valueOf(),
                  1.21 * i + 0.15 * i * i + (Math.random() - 0.5) * 1.5 + 8.2,
                ]
              )),
            }
          ],
        },
      };
    }
    res.json(result);
  });
  
  return app;
};

module.exports = makeApp;
