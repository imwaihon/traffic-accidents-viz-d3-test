'use strict'
var groupname = "dashboard" 

// Create chart objects globally
var accidentHourChart = dc.barChart('#accident-hour-chart', groupname);
var deathsInjuriesHourChart = dc.barChart('#deaths-injuries-hour-chart', groupname);
var accidentCauseChart = dc.rowChart('#accident-cause-chart', groupname);
var accidentDataCount = dc.dataCount("#accident-data-count", groupname);
var accidentMap = dc.leafletMarkerChart("#map", groupname)




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


    var killedGroup = hourDimension.group().reduceSum(function (d) { return d.killed; });
    var injuredGroup = hourDimension.group().reduceSum(function (d) { return d.injuries; });

    // Create Dimension by Cause
    var causeDimension = ndx.dimension(function (d) {
        if (d.factor1 != 'Unspecified') {
            return d.factor1;
        }
    })

    var causeDimensionGroup = causeDimension.group();


    // Map Dimension
    var geoDimension = ndx.dimension(function(d) { return d.coordinates; });
    var geoDimensionGroup = geoDimension.group();


    /* Margins, Width and Height */

    var C_MARGINS = {top: 20, left: 50, right: 10, bottom: 20}
    var C_HEIGHT = 200
    var C_WIDTH = 750
    
    /* Accident Hour Bar Chart */

    accidentHourChart
        .width(C_WIDTH)
        .height(C_HEIGHT)
        .margins(C_MARGINS)
        .dimension(hourDimension)
        .group(hourDimensionGroup)
        .valueAccessor(function (p) {
            return p.value.count;
        })
        .x(d3.scale.linear().domain([0,24]))
        .elasticX(true)
        .elasticY(true)
        .xAxisLabel('Hour') // (optional) render an axis label below the x axis
        .xAxis().ticks(12);

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

    /* Accident Map */
    accidentMap
        .width(800)
        .height(600)
        .group(geoDimensionGroup)
        .dimension(geoDimension)
        .center([40.71, -74.00])
        .zoom(11)
        .cluster(true)
        .clusterOptions({ //maxClusterRadius: 120, 
            iconCreateFunction: function(cluster) {
                return new L.DivIcon({ html: '<b>' + cluster.getChildCount() + '</b>' , className: 'mycluster', iconSize: L.point(30,30) });
            }
            //spiderfyOnMaxZoom: false, showCoverageOnHover: false, zoomToBoundsOnClick: false

        })
        .renderPopup(true)
        .filterByArea(true);


    // var colorRenderlet = function (chart) {
    //     chart.selectAll("rect.bar")
    //             .on("click", function (d) {
    //                 function setAttr(selection, keyName) {
    //                     selection.style("fill", function (d) {
    //                         if (d[keyName] == "killedCount") return "#63D3FF";
    //                         else if (d[keyName] == "injuredCount") return "#FF548F";
    //                     });
    //                 }
    //                 setAttr(_chart.selectAll("g.stack").selectAll("rect.bar"), "layer");
    //                 setAttr(_chart.selectAll("g.dc-legend-item").selectAll("rect"), "name")
    //             });
    // };

    deathsInjuriesHourChart
        .width(C_WIDTH)
        .height(C_HEIGHT)
        .margins(C_MARGINS)
        .dimension(hourDimension)
        .group(killedGroup)
        .brushOn(false)
        .x(d3.scale.linear().domain([0,24]))
        // .elasticX(true)
        // .elasticY(true)
        //.renderlet(colorRenderlet)
        .xAxisLabel('Hour'); // (optional) render an axis label below the x axis




    // Multi focus
    function rangesEqual(range1, range2) {
        if (!range1 && !range2) {
            return true;
        }
        else if (!range1 || !range2) {
            return false;
        }
        else if (range1.length === 0 && range2.length === 0) {
            return true;
        }
        else if (range1[0].valueOf() === range2[0].valueOf() &&
            range1[1].valueOf() === range2[1].valueOf()) {
            return true;
        }
        return false;
    }

    // monkey-patch the first chart with a new function
    // technically we don't even need to do this, we could just change the 'filtered'
    // event externally, but this is a bit nicer and could be added to dc.js core someday
    accidentHourChart.focusCharts = function (chartlist) {
        if (!arguments.length) {
            return this._focusCharts;
        }
        this._focusCharts = chartlist; // only needed to support the getter above
        this.on('filtered', function (range_chart) {
            if (!range_chart.filter()) {
                dc.events.trigger(function () {
                    chartlist.forEach(function(focus_chart) {
                        focus_chart.x().domain(focus_chart.xOriginalDomain());
                    });
                });
            } else chartlist.forEach(function(focus_chart) {
                if (!rangesEqual(range_chart.filter(), focus_chart.filter())) {
                    dc.events.trigger(function () {
                        focus_chart.focus(range_chart.filter());
                    });
                }
            });
        });
        return this;
    };

    dc.renderAll(groupname);

    var latlngs = []

    for (var i=0; i<dataset.length; i++) {
        latlngs.push(L.latLng(dataset[i].coordinates[0], dataset[i].coordinates[1]));
    }

    var heat = L.heatLayer(latlngs, {radius: 25}).addTo(accidentMap.map());

    accidentHourChart
    .focusCharts([deathsInjuriesHourChart]);

});


        