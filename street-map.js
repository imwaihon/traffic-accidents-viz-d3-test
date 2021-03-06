d3.csv('../data_sets/NYPD_Motor_Vehicle_Collisions.csv', function (error, dataset) {

    // Reformat the data set (should eventually be done independently before processing)
    function reformat(array) {
        var data = [];
        array.map(function (d, i) {
            // If coordinates are not null (LATITUDE and LONGITUDE)
            if (d.LATITUDE != "" && d.LONGITUDE != "") {
                data.push({
                    id: i,
                    type: "Feature",
                    geometry: {
                        coordinates: [+d.LONGITUDE, +d.LATITUDE], // Converts to int
                        type: "Point"
                    },
                    date: d.DATE,
                    time: d.TIME,
                    street: d["ON STREET NAME"],
                    injuries: d["NUMBER OF PERSONS INJURED"],
                    killed: d["NUMBER OF PERSONS KILLED"]

                });
            }
        });
        return data;
    }

    /*
    
    A quadtree is a two-dimensional recursive spatial subdivision. This implementation uses square partitions, 
    dividing each square into four equally-sized squares. Each point exists in a unique node; if multiple points 
    are in the same position, some points may be stored on internal nodes rather than leaf nodes. Quadtrees can be 
    used to accelerate various spatial operations, such as the Barnes-Hut approximation for computing n-body forces, 
    or collision detection.

    */


    // Find the nodes within the specified rectangle.
    function search(quadtree, x0, y0, x3, y3) {
        var pts = [];
        var subPixel = false;
        var subPts = [];
        var scale = getZoomScale();
        console.log(" scale: " + scale);
        var counter = 0;
        quadtree.visit(function (node, x1, y1, x2, y2) {
            var p = node.point;
            var pwidth = node.width * scale;
            var pheight = node.height * scale;

            // -- If this is too small rectangle only count the branch and set opacity
            if ((pwidth * pheight) <= 1) {
                // Start collecting sub Pixel points
                subPixel = true;
            }
                // -- Jumped to super node large than 1 pixel
            else {
                // End collecting sub Pixel points
                if (subPixel && subPts && subPts.length > 0) {
                    subPts[0].group = subPts.length;
                    pts.push(subPts[0]); // add only one todo calculate intensity
                    counter += subPts.length - 1;
                    subPts = [];
                }
                subPixel = false;
            }

            // If point is within boundaries (search rect)
            if ((p) && (p.x >= x0) && (p.x < x3) && (p.y >= y0) && (p.y < y3)) {

                if (subPixel) {
                    subPts.push(p.all);
                }
                else {
                    if (p.all.group) {
                        delete (p.all.group);
                    }
                    pts.push(p.all);
                }

            }
            // if quad rect is outside of the search rect do not search in sub nodes (returns true)
            return x1 >= x3 || y1 >= y3 || x2 < x0 || y2 < y0;
        });
        console.log(" Number of removed points: " + counter);
        return pts;

    }

    function updateNodes(quadtree) {
        var nodes = [];
        quadtree.depth = 0; // root

        quadtree.visit(function (node, x1, y1, x2, y2) {
            var nodeRect = {
                left: MercatorXofLongitude(x1),
                right: MercatorXofLongitude(x2),
                bottom: MercatorYofLatitude(y1),
                top: MercatorYofLatitude(y2),
            }
            node.width = (nodeRect.right - nodeRect.left);
            node.height = (nodeRect.top - nodeRect.bottom);

            if (node.depth == 0) {
                console.log(" width: " + node.width + "height: " + node.height);
            }
            nodes.push(node);
            for (var i = 0; i < 4; i++) {
                if (node.nodes[i]) node.nodes[i].depth = node.depth + 1;
            }
        });
        return nodes;
    }

    MercatorXofLongitude = function (lon) {
        return lon * 20037508.34 / 180;
    }

    MercatorYofLatitude = function (lat) {
        return (Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180)) * 20037508.34 / 180;
    }

    /* Leaflet Map */

    // Use Leaflet to implement a D3 geometric transformation.
    function projectPoint(x, y) {
        var point = leafletMap.latLngToLayerPoint(new L.LatLng(y, x));
        this.stream.point(point.x, point.y);
    }

    function getZoomScale() {
        var mapWidth = leafletMap.getSize().x;
        var bounds = leafletMap.getBounds();
        var planarWidth = MercatorXofLongitude(bounds.getEast()) - MercatorXofLongitude(bounds.getWest());
        var zoomScale = mapWidth / planarWidth;
        return zoomScale;

    }

    function redrawSubset(subset) {
        path.pointRadius(3);// * scale);

        var bounds = path.bounds({ type: "FeatureCollection", features: subset });
        var topLeft = bounds[0];
        var bottomRight = bounds[1];


        svg.attr("width", bottomRight[0] - topLeft[0])
          .attr("height", bottomRight[1] - topLeft[1])
          .style("left", topLeft[0] + "px")
          .style("top", topLeft[1] + "px");


        g.attr("transform", "translate(" + -topLeft[0] + "," + -topLeft[1] + ")");

        var start = new Date();

        var tip = d3.tip().attr('class', 'd3-tip').html(function(d) { return JSON.stringify(d); });
        var points = g.selectAll("path")
                      .data(subset, function (d) {
                          return d.id;
                      });
        
        points.enter().append("path");
        points.exit().remove();
        points.attr("d", path);
        points.call(tip)
        points.on('mouseover', tip.show)
        points.on('mouseout', tip.hide)

        points.style("fill-opacity", function (d) {
            if (d.group) {
                return (d.group * 0.1) + 0.2;
            }
        });

        console.log("updated at  " + new Date().setTime(new Date().getTime() - start.getTime()) + " ms ");

    }

    function mapmove(e) {
        var mapBounds = leafletMap.getBounds();
        var subset = search(qtree, mapBounds.getWest(), mapBounds.getSouth(), mapBounds.getEast(), mapBounds.getNorth());
        console.log("subset: " + subset.length);

        redrawSubset(subset);

    }


    /* Pipeline */


    // Data set loaded
    var geoData = { type: "FeatureCollection", features: reformat(dataset) };

    console.log(geoData)

    // Using quadtree to reduce number of points shown
    var qtree = d3.geom.quadtree(geoData.features.map(function (data, i) {
        return {
            x: data.geometry.coordinates[0],
            y: data.geometry.coordinates[1],
            all: data
        };
    }));

    //"#00FF00","#FFA500"
    var cscale = d3.scale.linear().domain([1, 3]).range(["#ff0000", "#ff6a00", "#ffd800", "#b6ff00", "#00ffff", "#0094ff"]);
    
    // Set up leaflet map with initial lat long
    var leafletMap = L.map('map').setView([40.71, -74.00], 11);
    // Black background map
    L.tileLayer("http://{s}.sm.mapstack.stamen.com/(toner-lite,$fff[difference],$fff[@23],$fff[hsl-saturation@20])/{z}/{x}/{y}.png").addTo(leafletMap);


    // SVG object in leaflet map pane
    var svg = d3.select(leafletMap.getPanes().overlayPane).append("svg");
    var g = svg.append("g").attr("class", "leaflet-zoom-hide");

    var transform = d3.geo.transform({ point: projectPoint });
    var path = d3.geo.path().projection(transform);

    updateNodes(qtree);

    // Update when map is moved
    leafletMap.on('moveend', mapmove);

    // Update
    mapmove();



});