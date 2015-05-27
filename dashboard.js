'use strict'

// Create chart objects globally
var accidentHourChart = dc.barChart('#accident-hour-chart');
var accidentCauseChart = dc.rowChart('#accident-cause-chart');
var accidentDataCount = dc.dataCount("#accident-data-count");




d3.csv('../data_sets/2014_accidents.csv', function (error, raw_dataset) {

    // Reformat the data set (should eventually be done independently before processing)
    function reformat(array) {
        var data = [];

        array.map(function (d, i) {
            // If coordinates are not null (LATITUDE and LONGITUDE)
            if (d.LATITUDE != "" && d.LONGITUDE != "") {
                data.push({
                    coordinates: [+d.LATITUDE, +d.LONGITUDE],
                    date: d.DATE,
                    time: d.TIME,
                    month: +d.MONTH,
                    hour: +d.HOUR,
                    street: d["ON STREET NAME"],
                    injuries: d["NUMBER OF PERSONS INJURED"],
                    killed: d["NUMBER OF PERSONS KILLED"],
                    factor1: d["CONTRIBUTING FACTOR VEHICLE 1"]

                });
            }
        });
        return data;
    }

    var dataset = reformat(raw_dataset) 

    /* Create crossfilter dimensions and groups */

    var ndx = crossfilter(dataset);
    var all = ndx.groupAll();


    // Create Dimension by Hour
    var hourDimension = ndx.dimension(function (d) {
    	return d.hour;
    });

    var hourDimensionGroup = hourDimension.group().reduce(
        /* callback for when data is added to the current filter results */
        function (p, v) {
            ++p.count;
            p.killedCount += v.killed;
            p.injuredCount += v.injured;
            return p;
        },
        /* callback for when data is removed from the current filter results */
        function (p, v) {
            --p.count;
            p.killedCount -= v.killed;
            p.injuredCount -= v.injured;
            return p;
        },
        /* initialize p */
        function () {
            return {
                count: 0,
                killedCount: 0,
                injuredCount: 0,
            };
        }
    );

    // Create Dimension by Cause
    var causeDimension = ndx.dimension(function (d) {
        if (d.factor1 != 'Unspecified') {
            return d.factor1;
        }
    })

    var causeDimensionGroup = causeDimension.group();


    // Map Dimension
    var geoDimension = ndx.dimension(function(d) { return d.coordinates; });
    var geoDimensionGroup = geoDimension.group().reduceCount();


    /* Margins, Width and Height */

    var C_MARGINS = {top: 20, left: 10, right: 10, bottom: 20}
    var C_HEIGHT = 200
    var C_WIDTH = 800
    
    /* Accident Hour Bar Chart */

    accidentHourChart
        .width(C_WIDTH)
        .height(C_HEIGHT)
        .margins(C_MARGINS)
        .group(hourDimensionGroup)
        .dimension(hourDimension)
        .valueAccessor(function (p) {
            return p.value.count;
        })
        .x(d3.scale.linear().domain([0, 24]))
        .elasticX(true)
        .xAxis().ticks(4);

    /* Accident Cause Row Chart */

	accidentCauseChart
		.width(C_WIDTH)
	    .height(C_HEIGHT)
        .margins(C_MARGINS)
        .group(causeDimensionGroup)
        .dimension(causeDimension)
        .ordering(function (t) { return t.value })
        .cap(5)

        .elasticX(true)
        .xAxis().ticks(4);

    /* Data Count */
    accidentDataCount
        .dimension(ndx)
        .group(all);

    dc.leafletMarkerChart("#map")
      .dimension(geoDimension)
      .group(geoDimensionGroup)
      .center([40.71, -74.00])
      .zoom(11)
      .locationAccessor(function (d) { return d.coordinates; })
      .renderPopup(false)
      .filterByArea(true); 

    dc.renderAll();

});


        