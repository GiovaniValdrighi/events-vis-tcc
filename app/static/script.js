function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}
  
function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}
  
function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
}

function RgbStringToRgb(rgb_string){
    return rgb_string.slice(4, -1).split(",").map(d => parseFloat(d));
}

function rgbObj_toHex(rgbObj){
    return [rgbObj.r, rgbObj.g, rgbObj.b];
}

function time_to_date(x){
    return new Date(x);
}

function prev_day(d){
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate());
    return d;
}

function next_day(d){
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
}

const {DeckGL, ScatterplotLayer, PathLayer, PolygonLayer}= deck;

class distortionScale{
    constructor(){
      this.linear = d3.scaleLinear()
    }

    domain(minVal, step_size, data, acess_left, acess_right, distortion){
        this.distortion = distortion;
        this.step_size = step_size;

        //Identify the number of steps and the start and end values
        this.minVal = minVal;
        this.maxVal_ = d3.max(data.map(d => acess_right(d)));
        this.maxVal = minVal;
        while(this.maxVal < this.maxVal_){
            this.maxVal = this.maxVal + this.step_size;
        }
        var maxVal = this.maxVal;
        var n_steps = (maxVal - minVal + step_size) / step_size;

        //Create the bins of the scale
        this.bins = [];
        for(let i = 0; i < n_steps; i++) {
            this.bins.push({"x0": minVal + step_size * i, "x1": minVal + step_size * (i + 1), "count": 0,
                            "scale" : d3.scaleLinear().domain([minVal + step_size * i, minVal + step_size * (i + 1)])})
        }
        this.linear.domain([minVal, maxVal]) 

        //For each data, update the counter of all bins that are included
        for(let i = 0; i < data.length; i++){
            const x1 = acess_left(data[i]);
            const x2 = acess_right(data[i]);
            const ind1 = parseInt(Math.floor((x1 - this.minVal)/this.step_size));
            const ind2 = parseInt(Math.floor((x2 - this.minVal)/this.step_size));


            for(let i = ind1; i <= ind2; i++){
                this.bins[Math.min(i, this.bins.length - 1)].count++;
            }
        }

        const bins_count = this.bins.reduce((a, b) => a + b.count, 0);
        //Update proportion for bins
        for(let i = 0; i < this.bins.length; i++){
            this.bins[i].proportion = this.bins[i].count/bins_count;
        }
    }
    
    range(rangeVal){
        this.linear.range(rangeVal)
        var range_width = rangeVal[1] - rangeVal[0]
        var cur_end = rangeVal[0]
        for(let i = 0; i < this.bins.length; i++){
            this.bins[i].scale.range([cur_end, cur_end + range_width * this.bins[i].proportion])
            cur_end = this.bins[i].scale.range()[1]
        }
    }

    transform(x){
        if(!this.distortion){
            return this.linear(x);
        }
        var ind = parseInt(Math.floor((x - this.minVal)/this.step_size))
        return this.bins[Math.min(ind, this.bins.length - 1)].scale(x);
    }

    transform_left(x){
        if(!this.distortion){
            return this.linear(x);
        }
        var ind = parseInt(Math.floor((x - this.minVal)/this.step_size))
        return this.bins[Math.min(ind, this.bins.length - 1)].scale.range()[0];
    }

    transform_right(x){
        if(!this.distortion){
            return this.linear(x);
        }
        var ind = parseInt(Math.floor((x - this.minVal)/this.step_size))
        return this.bins[Math.min(ind, this.bins.length - 1)].scale.range()[1];
    }

    invert(x){
        return this.linear.invert(x);
    }
}

class Visualization{
    
    constructor(){
        //Datasets configurations
        this.start_dataset_config();
        this.data = new Object();

        // Main plot visual configuration
        this.margin = {"left": 50, "top": 10, "bottom": 50, "right":10};
        this.axis_connection_height = 30;
        this.colorBar_width = 25;
        this.width = 870 - this.margin.left - this.margin.right -  - this.colorBar_width;;
        this.height = 390 - this.margin.top - this.margin.bottom - this.axis_connection_height;
        this.svg_plot = d3.select("#main_plot")
            .append("svg")
            .attr("width", this.width + this.margin.left + this.margin.right +  - this.colorBar_width)
            .attr("height", this.height + this.margin.top + this.margin.bottom + this.axis_connection_height);

        this.color_categoric_pallete = ['#fccde5','#ffffb3','#bebada',
                              '#fb8072','#80b1d3','#fdb462',
                              '#b3de69','#8dd3c7','#d9d9d9',
                              '#bc80bd','#ccebc5','#ffed6f']
        this.colorScale;
        this.interactive_selections = {"event_clicked" : [], "time_selection": [], "space_selection": []};
    }


    /**
     * Function that set all the attributes for each of the datasets 
     * that will be used in the visualization.
     */
    start_dataset_config(){
        this.dataset_config = {};
        this.dataset_config["traffic_dec_marc_comments"] = {
            "type" : "map",
            "tooltip_cols": ["start_date", "type", "comments"],
            "rollup_func": function(v){
                return {
                    count : v.length,
                    duration: d3.max(v.map(d => d.time)) - d3.min(v.map(d=> d.time)),
                    area: d3.max(v.map(d => d.area))
                };
            },
            "parallel_attr": [
                {"name": "total_points", "label": "Number of alerts"},
                {"name": "duration", "label": "Duration (h)"},
                {"name": "area", "label": "Area"}
            ],
            "xticks": x => {
                var d = new Date(x);
                return d.getDate() + "/" + (d.getMonth() + 1);
            },
            "color_attr" : [{"value": "event", "label": "Event", "type": "categorical"}],
            "minVal": new Date(2018, 11, 1).valueOf(),
            "step_size": 86400000 * 7,
            "ticks_freq": 7
        }; 

        this.dataset_config["traffic_february_comments"] = {
            "type" : "map",
            "tooltip_cols": ["start_date", "end_date", "type", "comments"],
            "rollup_func": function(v){
                return {
                    count : v.length,
                    duration: d3.max(v.map(d => d.time)) - d3.min(v.map(d=> d.time)),
                    area: d3.max(v.map(d => d.area))
                };
            },
            "parallel_attr": [
                {"name": "total_points", "label": "Number of alerts"},
                {"name": "duration", "label": "Duration (h)"},
                {"name": "area", "label": "Area"}
            ],
            "xticks": x => {
                var d = new Date(x);
                return d.getDate() + "/" + (d.getMonth() + 1);
            },
            "color_attr" : [{"value": "event", "label": "Event", "type": "categorical"}],
            "minVal": new Date(2019, 1, 1).valueOf(),
            "step_size": 86400000,
            "ticks_freq": 1
        }; 
    }

    /**
     * Function that read the form of visualization options and update variables.
     */
    update_options(){
        this.projection = document.getElementById("projection").value;
        this.intersections = document.getElementById("intersections").value;
        this.color_attr = document.getElementById("color_attr").value;
        this.time_distortion = ($("#time_distortion").is(":checked") |
             $("#time_distortion_fit").is(":checked"));
        this.fit_grid = $("#time_distortion_fit").is(":checked");
        
    }

    /**
     * Function that update the form options based on the dataset.
     */
    update_form_options(){
        var s = "";
        //updating color attributes selector
       this.dataset_config_cur['color_attr'].forEach(d =>{
            s = s + `<option value="${d.value}">${d.label}</option>`
        })
        document.getElementById("color_attr").innerHTML = s;
    }

    /**
     * Function that look the color scale selection on the form and set the d3 color scale
     * with new range and domain.
     */
    update_color_scale(){
        const self = this;
        self.color_attr = document.getElementById("color_attr").value;
        const color_attr_selected = self.dataset_config_cur.color_attr
            .filter(d => d.value == self.color_attr)[0];
        const color_attr_type = color_attr_selected.type;
        self.color_attr_value = color_attr_selected.value;
        if(color_attr_type == 'categorical'){
            self.colorScale = d3.scaleOrdinal()
            .range(self.color_categoric_pallete)
            .domain(self.data.events.filtered.map(d => d[self.color_attr_value]));
        }else if(color_attr_type == 'continuous'){
            self.colorScale = d3.scaleSequential()
                .interpolator(d3.interpolateRdBu)
                .domain([d3.min(self.data.events.filtered.map(d => d[self.color_attr_value])), 
                d3.max(self.data.filtered.map(d => d[self.color_attr_value]))]);
        }
    }

    /**
     * Function that sent dataset name to server and start parallel coordinates and map plot.
     */
    set_dataset(){
        this.dataset_name = document.getElementById("dataset").value;
        this.dataset_config_cur = this.dataset_config[this.dataset_name];
        var dataset = this.dataset_name;
        const type = this.dataset_config_cur.type;

        this.update_form_options();

        var ajax_request = $.ajax({
            type: 'POST',
            contentType: "application/json;charset=utf-8",
            url: "/set_dataset",
            traditional: "true",
            data: JSON.stringify({dataset}),
            dataType: "json"
        })

        const self = this;
        ajax_request.always(function(html){

            d3.select("#parallel_plot").selectAll("*").remove();
            self.parallelCoordinates = new ParallelCoordinates(
                self,
                "#parallel_plot",
                self.dataset_config_cur.parallel_attr 
            );

            fetch("http://127.0.0.1:5000/get_complete_data")
            .then(response => {
                if(response.status == 200){
                    return response.json()
                }else{
                    throw new Error("Server error")
                }   
            }).then(function(response){

                self.data.points = response['points'];
                self.data.events = response['events'];
                self.data.points.filtered = self.data.points.slice();
                self.data.events.filtered = self.data.events.slice();

                self.update_color_scale();
                self.parallelCoordinates.draw();
                if(type == "map"){
                    self.start_map_plot();
                    self.render_map();
                }
                //self.update();
            })
        })
        
    }

    /**
     * Function that update the filtered data based on the selection of events in the Parallel Coordinates.
     * @param {Array of ints} selected_events 
     */
    set_filtered_data(selected_events){
        const self = this;

        var ajax_request = $.ajax({
            type: 'POST',
            contentType: "application/json;charset=utf-8",
            url: "/set_filtered_data",
            traditional: "true",
            data: JSON.stringify({selected_events}),
            dataType: "json"
        });

        ajax_request.always(function(html){
            self.data.events.filtered = self.data.events.filter(d => selected_events.includes(d.event));
            self.data.points.filtered = self.data.points.filter(d => selected_events.includes(d.event));
            self.update_color_scale();
            var min_date = new Date(d3.min(self.data.events.filtered.map(d => d.start_time)));
                
            self.dataset_config_cur["minVal"] = new Date(
                min_date.getFullYear(), 
                min_date.getMonth(),
                min_date.getDate()).valueOf()
            if(self.dataset_config_cur.type == "map"){
                self.render_map(self.data.points.filtered);
            }
            self.preprocess();
        })
    }

    /**
     * Function that starts a new Mapbox object and set it on the document.
     */
    start_map_plot(){
        document.getElementById("data_plot").innerHTML = "";
        document.getElementById("data_plot_block_title").innerHTML = "MAP VIEW";
        var map_div = document.createElement("div");
        map_div.id = "map_plot";
        document.getElementById("data_plot").appendChild(map_div);

        this.deckgl = new deck.DeckGL({
            mapboxApiAccessToken: 'pk.eyJ1IjoiZ2lvdmFuaXZhbGRyaWdoaSIsImEiOiJja21rc3I1NzcwN3QxMnBvZGI4Nmk2b2N4In0.45WjGvP8-yh5Kl5FpBLb_g',
            mapStyle: 'mapbox://styles/mapbox/light-v9',
            container: "map_plot",
            initialViewState: {
                longitude: -59.896603,
                latitude: 31.357102,
                zoom: 1
            },
            controller: true,
            layers: []
        });
        
        var tooltip_div = document.createElement("div");
        tooltip_div.id = "map_tooltip";
        document.getElementById("data_plot").appendChild(tooltip_div);
    }

    /**
     * Function that draw all shapes in the map plot with selections.
     */
    render_map(){
        const self = this;

        //Separate in background data and in highlight data
        var background_data = this.data.points.filtered;
        var highlight_data;
        console.log(this.interactive_selections)
        if((this.interactive_selections.event_clicked.length == 0) &
            (this.interactive_selections.time_selection.length == 0) & 
            (this.interactive_selections.space_selection.length == 0)){
                highlight_data = background_data.slice();
        }else{
            const y0 = this.interactive_selections.space_selection[0];
            const y1 = this.interactive_selections.space_selection[1];
            const event_time_spatial_selection = self.data.scatter_events.filter(d => {
                return (d.y >= y0) & (d.y <= y1);
            });

            const event_spatial_selection = [...new Set(event_time_spatial_selection.map(d => d.event))];
            const interval_spatial_selection = [...new Set(event_time_spatial_selection.map(d => d.interval))];
            highlight_data = background_data.filter(d => {
                var b1, b2, b3;
                b1 = self.interactive_selections.event_clicked.includes(d.event);
                b2 = ((this.interactive_selections.time_selection[0] <= d.time) &
                    (this.interactive_selections.time_selection[1] > d.time));
                b3 = ((event_spatial_selection.includes(d.event)) & 
                    (interval_spatial_selection.includes(Math.floor(d.time/self.time_interval))));
                return b1 | b2 | b3;
            });
        } 
        
        //Scatter layer of background points
        const scatterLayer = new ScatterplotLayer({
            id: 'complete_layer',
            data: background_data,
            pickable: true,
            filled: true,
            opacity: 0.15,
            stroked: false,
            radiusScale: 1,
            radiusUnits: 'pixels',
            getRadius: 5,
            getPosition: d => [d.longitude, d.latitude],
            getFillColor: d => [90, 90, 90]//hexToRgb(self.colorScale(d.event)),
        })

        //Scatter layer of highlight points
        const scatterSelected = new ScatterplotLayer({
            id: 'selected_layer',
            data: highlight_data,
            pickable: true,
            filled: true,
            opacity: 1,
            stroked: true,
            lineWidthUnits: 'pixels',
            lineWidthScale: 1,
            getLineWidth: 1,
            radiusScale: 1,
            radiusUnits: 'pixels',
            getRadius: 7,
            getPosition: d => [d.longitude, d.latitude],
            getFillColor: d => rgbObj_toHex(d3.rgb(self.colorScale(d[self.color_attr_value]))),
            onHover: ({object, x, y}) => {
                //Creating the tooltip shown when mouse hover of a event point
                const el = document.getElementById('map_tooltip');
                if(object){
                    let string = self.dataset_config_cur.tooltip_cols.reduce((a, b) => {
                        return a + b + ": " + object[b] + "</br>"
                    }, "");
                    el.innerHTML = string;
                    el.style.display = 'block';
                    el.style.top = y+10 + 'px';
                    el.style.left = x+10 + 'px';
                    el.style.opacity = 1;
    
                }else{
                    el.style.display = 'none';
                }
            },
        })

        self.deckgl.setProps({
                layers: [scatterLayer, scatterSelected]
            });
    }

    preprocess(){
        this.update_options();
        const self = this;
        var myUrl = ('http://127.0.0.1:5000/get_scatter_data/' 
                    + this.projection + "|" 
                    + this.intersections);

        fetch(myUrl)
        .then(response => {
            if(response.status == 200){
                return response.json()
            }else{
                throw new Error("Server error")
            }
        }).then(function(response){
            self.data.scatter_points = response['points'];
            self.data.scatter_events = response['events'];
            self.update();
        }) 
    }
    
    update(){
        this.svg_plot.selectAll("*").remove();
        this.interactive_selections = {"event_clicked" : [], "time_selection": [], "space_selection": []};
        this.update_options();
        this.update_color_scale();
        this.plot();
    }

    plot_colorbar = (g, y) => {
        
        g.selectAll("colorbar_rect")
            .data(this.data.scatter_points)
            .join("rect")
            .attr("width", 20)
            .attr("height", d => y(d.y - d.height/2) - y(d.y + d.height/2))
            .attr("x", 0)
            .attr("y", d => y(d.y + d.height/2))
            .attr("fill", d => rgbToHex(...d.color));

    }

    /**
     * Create a path that is a draw of a tilde in the specified position and size.
     * @param {Float} width width of tilde
     * @param {Float} x x position of tilde
     * @param {Float} y y position of tilde
     * @returns 
     */
    create_tilde = (width, x, y) => {
        var line = d3.line()
          .x(d => d[0])
          .y(d => d[1])
          .curve(d3.curveBasisOpen);
        var points = [[0, -40], [20, 20], [40, 0], [60, 10], [60, 10]];
        for(let i = 0; i < points.length; i++){
          points[i] = [points[i][0]*width*1.5/60 + x, points[i][1]*width*1.5/60 + y];
        }
        return line(points);
    }

    /**
     * Function that draw the y-axis.
     * @param {*} g group object to add the axis
     * @param {*} y scale
     */
    plot_axis_vertical = (g, y) => {
        const g_yaxis = g.append("g")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

        g_yaxis.call(d3.axisLeft(y).tickFormat(""));
    }

    /**
     * Function that draw the x-axis and grid lines.
     * @param {*} g group object to draw the guide lines.
     * @param {*} x scale.
     */
    plot_axis_horizontal = (g, x) => {
        const self = this;
        
        const g_xaxis = g.append("g")
            .attr("transform", `translate(0,${this.height + this.margin.top})`);

        //Drawing axis and adding grid
        g_xaxis
        .append("g")
        .call(d3.axisBottom(x)
            .tickSize(-self.height - self.margin.top)
            .tickFormat(d3.timeFormat("%d/%m"))
            .ticks(d3.timeDay.every(self.dataset_config_cur["ticks_freq"])));

        /*
        g_xaxis
            .call(d3.axisBottom(x)
                .tickFormat(d3.timeFormat("%d/%m"))
                .ticks(d3.timeDay.every(1)));
        */
    
    }

    /**
     * Function that draw the complete x-axis and then draw the guide lines for time distortion.
     * @param {*} g group object to draw the guide lines.
     * @param {*} x scale.
     * @param {*} vspace values for positioning the guide lines.
     */
     plot_grid = (g, x, vspace) => {
        const self = this;
        var path = d3.line();
        var y0 = vspace[0];
        var y1 = vspace[1];
        var y2 = vspace[2];
        var y3 = vspace[3];

        const g_xaxis = g.append("g")
            .attr("transform", `translate(0, 
                ${this.height + this.margin.top + this.axis_connection_height})`)

        //Plotting a separation line between the vertical lines and the lines with angle
        g.append("rect")
            .attr("x", 0)
            .attr("y", y1)
            .attr("width", self.width)
            .attr("height", 1)
            .attr("fill", "#303030")
            .attr("opacity", 0.75);

        //plot grid cells
        for(let i = 0; i < x.bins.length; i++){
            var x0 = x.bins[i].x0;
            var x1 = x.bins[i].x1;

            var divisor = [[x.transform(x0), y0],
                        [x.transform(x0), y1],
                        [x.linear(x0), y2],
                        [x.linear(x0), y3]];

            g.append("path")
              .attr("d", path(divisor))
              .attr("stroke", "#cccccc")
              .attr("stroke-opacity", 1)
              .attr("stroke-width", 0.5)
              .attr("fill", "none")
              .attr("class", "grid_divisor");

            if(i == x.bins.length - 1){
                divisor = [[x.transform(x1), y0],
                        [x.transform(x1), y1],
                        [x.linear(x1), y2],
                        [x.linear(x1), y3]];

                g.append("path")
                    .attr("d", path(cell))
                    .attr("stroke", "#fefefe")
                    .attr("stroke-opacity", 1)
                    .attr("stroke-width", 0.5)
                    .attr("fill", "none")
                    .attr("class", "grid_divisor");
            }

            //Empty shape that will be used for interaction
            var cell = [[x.transform(x0), y0],
                [x.transform(x0), y1],
                [x.linear(x0), y2],
                [x.linear(x0), y3],
                [x.linear(x1), y3],
                [x.linear(x1), y2],
                [x.transform(x1), y1],
                [x.transform(x1), y0],
                [x.transform(x0), y0]];
                
            g.append("path")
              .attr("d", path(cell))
              .attr("stroke", "#303030")
              .attr("stroke-opacity", 0)
              .attr("stroke", "blue")
              .attr("fill", "none")
              .attr("class", "grid_cell")
              .attr("id", "grid_cell_"+ i);

            
        }

        //Drawing axis and adding brush
        g_xaxis.call(d3.axisBottom(x.linear)
            .tickValues(x.bins.map(d => d.x0))
            .tickFormat(d => self.dataset_config_cur.xticks(d)));
    }

    /**
     * Recieve the g element, the x/y scales and plot the shapes that represents events.
     * @param {g} g group object to draw the shapes
     * @param {distortionScale} x scale
     * @param {breakScale} y scale
     */
    plot_events_shapes = (g, x, y) => {

        const self = this;
        const data = self.data.scatter_events;
        const color_attr = self.color_attr;
        const padding = this.time_interval*0.2;        

        if(this.fit_grid){
            g.append("g")
                .selectAll(".event_shape")
                .data(data)
                .join("rect")
                .attr("x", d => x.transform_left(d.start_time))
                .attr("y", d => y(d.y + d.area/2))
                .attr("width", d => x.transform_right(d.end_time)- x.transform_left(d.start_time))
                .attr("height", d => y(d.y - d.area/2) - y(d.y + d.area/2))
                .attr("opacity", 0.6)
                .attr("class", "event_shape");
        }else{
            g.append("g")
                .selectAll(".event_shape")
                .data(data)
                .join("rect")
                .attr("x", d => x.transform(d.start_time))
                .attr("y", d => y(d.y + d.area/2))
                .attr("width", d => x.transform(d.end_time)- x.transform(d.start_time))
                .attr("height", d => y(d.y - d.area/2) - y(d.y + d.area/2))
                .attr("opacity", 0.6)
                .attr("class", "event_shape");
                
        }

        g.selectAll(".event_shape")
            .attr("fill", d => self.colorScale(d[color_attr]))
            .attr("stroke", d => self.colorScale(d[color_attr]))
            .on("click", function(m){
                var obj = d3.select(this);
                var d = obj.data()[0];
                var event = d.event;
                //If object is selected, remove it to array
                if(obj.classed("selected")){
                    d3.select(this)
                        .attr("stroke", self.colorScale(d[color_attr]))
                        .classed("selected", false);

                    self.interactive_selections.event_clicked = self.interactive_selections
                        .event_clicked.filter(dd => dd != event);
                //If is not selected, add it to array
                }else{
                    d3.select(this)
                        .attr("stroke", "#303030")
                        .classed("selected", true);
                    self.interactive_selections.event_clicked.push(event);
                }
                
                self.render_map();
                
            });
        
    }

    plot_points = (g, x, y) => {

        const self = this;
        const data = self.data.scatter_points;
        const color_attr = self.color_attr;
        const padding = this.time_interval*0.2;        

        if(this.fit_grid){
            var pass = 0;
        }else{
            g.append("g")
                .selectAll(".inner_point")
                .data(data)
                .join("rect")
                .attr("x", d => x.transform(d.start_time))
                .attr("y", d => y(d.y + d.height/2))
                .attr("width", d => x.transform(d.end_time)- x.transform(d.start_time))
                .attr("height", d => y(d.y - d.height/2) - y(d.y + d.height/2))
                .attr("fill", d => self.colorScale(d[color_attr]))
                
        }
    }

    plot(){
        const data = this.data.scatter_events;

        
        const x = new distortionScale()
        x.domain(this.dataset_config_cur.minVal,
            this.dataset_config_cur.step_size,
            data,
            d => d.start_time,
            d => d.end_time,
            this.time_distortion);
        x.range([0, this.width]);

        const y = d3.scaleLinear()
            .domain([d3.min(data.map(d => d.y - d.area/2)), d3.max(data.map(d => d.y + d.area/2))])
            .range([this.height, 0])
        console.log(y.domain())
        var central_g = this.svg_plot.append("g")
            .attr("transform", `translate(${this.margin.left + this.colorBar_width}, ${this.margin.top})`);
            
        central_g.append("text")
            .attr("class", "x label")
            .attr("text-anchor", "end")
            .attr("x", this.width - 40)
            .attr("y", this.height + 70)
            .text("Date");

        central_g.append("text")
            .attr("class", "y label")
            .attr("text-anchor", "end")
            .attr("y", -this.colorBar_width - 20)
            .attr("dy", ".75em")
            .attr("transform", "rotate(-90)")
            .text("Space");
        //this.plot_axis_horizontal(central_g, x); 
        this.plot_grid(central_g, x, 
            [0, 
            this.height,
            this.height + this.axis_connection_height,
            this.height + this.axis_connection_height + 5]); 

        this.plot_axis_vertical(this.svg_plot, y);

        const colorBar_g = this.svg_plot.append("g")
            .attr("transform", "translate(" + (this.margin.left + 5) + "," + this.margin.top + ")");
        this.plot_colorbar(colorBar_g, y);

        this.plot_events_shapes(central_g, x, y);

        this.plot_points(central_g, x, y);

        this.render_map();
    }
}


$(document).ready(function(){
    var vis = new Visualization();

    $("#update_dataset").on("click", function(e){
        e.preventDefault();
        vis.set_dataset();
    });

    $("#preprocess").on("click", function(e){
        e.preventDefault();
        vis.preprocess();
    })
    
    $("#update").on("click", function(e){
        e.preventDefault();
        vis.update();
    });
})