function round_2_decimals(num) {
    if (typeof num === 'string') num = parseFloat(num);
    return Math.round(num * 100) / 100;
};

class Visualization{
    constructor(){
        this.color_pallete =  [
            '#a6cee3','#1f78b4','#b2df8a','#33a02c',
            '#fb9a99','#e31a1c','#fdbf6f','#ff7f00',
            '#cab2d6','#6a3d9a','#ffff99','#b15928'
        ];

        this.metrics = ['intersection', 'intersection_non_zero', 'intersection_zero', "stress", 'neighborhood', "height", "time"];
        this.params = [
            'projection', 'method', 
            'height', 'zeros', 
            'lambda1', 'tau1', 'tau2'];
        
        this.events = [];
        this.cur_event = {"points": [], "color": []};
        this.methods = [];

        this.svg_events = d3.select("#data")
            .append("svg")
            .attr("id", "svg_events")
            .attr("width", 400)
            .attr("height", 400);

        this.results_width = 860;

        this.svg_results = d3.select("#results").append("svg")
            .attr("width", this.results_width)
            .attr("height", 400);

        this.svg_events_interactivity();
    }

    /**
     * Add new row of selectors for a new method.
     */
    new_method(){
        var n_methods = this.methods.length;
        var row = document.createElement("tr")
        row.id = "row_"+n_methods;
        row.innerHTML = `
        <td>
            <select name = "projection" id = "projection_${n_methods}">
                <option value = "pca">PCA</option>
                <option value ="mds_metric">MDS Metric</option>
                <option value ="mds_non_metric">MDS Non-Metric</option>
                <option value = "tsne">tSNE</option>
                <option value = "umap">UMAP</option>
                <option value = "hilbert_3">Hilbert order 3</option>
                <option value = "hilbert_5">Hilbert order 5</option>
                <option value = "hilbert_7">Hilbert order 7</option>
                <option value = "morton_3">Morton order 3</option>
                <option value = "morton_5">Morton order 5</option>
                <option value = "morton_7">Morton order 7</option>
            </select>
        </td>
        <td>
            <select name="method" id="method_${n_methods}">
                <option value="greedy">Greedy</option>
                <option value="mixed_integer">Mixed Integer</option>
            </select>
        </td>
        <td>
            <select name="height" id="height_${n_methods}">
                <option value="-">-</option>
                <option value="fixed_height">Fixed height</option>
                <option value="optim_height">Optim height</option>
            </select>
        </td>
        <td>
            <select name="zeros" id="zeros_${n_methods}">
                <option value="-">-</option>
                <option value="ignore_zeros">Ignore zeros</option>
                <option value="optim_zeros">Optim zeros</option>
            </select>
        </td>
        <td>
            <input type = "text" id = "lambda1_${n_methods}" value = "-" size = 1> 
        </td>
        <td>
           <input type = "text" id = "tau1_${n_methods}" value = "-" size = 1>
        </td>
        <td>
            <input type = "text" id = "tau2_${n_methods}" value = "-" size = 1>
        </td>
        `
        
        this.metrics.forEach(metric => {
            row.innerHTML += `<td id = "${metric}_row_${n_methods}"  class = "td_error"> </td>`
        });

        document.getElementById("table_methods_tbody").appendChild(row);

        var cur_method = {};
        this.params.forEach(param => {
            cur_method[param] = document.getElementById(param+"_"+n_methods);
        });
        this.methods.push(cur_method);
        
        MathJax.Hub.Queue(["Typeset", MathJax.Hub, "all_"+this.n_methods]);
    }

    /**
     * Remove a row of selectors of methods.
     */
    remove_method(){
        if(this.methods.length > 0){
            var row = document.getElementById("row_"+(this.methods.length - 1));
            row.parentNode.removeChild(row);
            this.methods.pop();
        }
    }

    /**
     * Add mouse click interactivity to draw new events in svg.
     */
    svg_events_interactivity(){
        var self = this;
        this.svg_events
        .on("click", function(event, d){
            var m = d3.pointer(event);
            self.plot_point(self.svg_events, [m[0] - 10, m[1] - 10]);
            self.cur_event['points'].push([m[0] - 10, m[1]- 10])
            self.cur_event['color'] = self.color_pallete[parseInt(self.events.length % self.color_pallete.length)]
            if(event.shiftKey){
                self.finish_polygon();
            }    
        })
        .on("mouseover", function(event, d){
            d3.select(this)
                .append("circle")
                .attr("cx", event.layerX - 10)
                .attr("cy", event.layerY - 10)
                .attr("r", 5)
                .attr("id", "cursor_circle")
                .attr("fill", "none")
                .attr("stroke", event.shiftKey ? "#49274a" : "#94618e")
                .attr("stroke-width", "4px"); 
        })
        .on("mouseout", function(){
            d3.selectAll("#cursor_circle").remove();
        })
        .on("mousemove", function(event, d){
            d3.selectAll("#cursor_circle")
                .attr("cx", event.layerX - 10)
                .attr("cy", event.layerY - 10)
                .attr("stroke", event.shiftKey ? "#49274a" : "#94618e");
        });
    }

    /**
     * Draw a green point in the specified position.
     * @param {group} g - group to draw point;
     * @param {array} p - array with position of point.
     */
    plot_point(g, p){
        g.append("circle")
            .attr("cx", p[0])
            .attr("cy", p[1])
            .attr("r", 5)
            .attr("fill", "none")
            .attr("stroke", "#94618e")
            .attr("stroke-width", "2px")
            .attr("class", "marker_point");
    }

    /**
     * Send set of points to server, server return coordinates of convex hull of points.
     */
    finish_polygon(){
        const self = this;
        var cur_event = JSON.parse(JSON.stringify(this.cur_event));
        $.ajax({
            type : "POST",
            contentType: "application/json;charset=utf-8",
            url: "http://localhost:5000/event_convex_hull",
            traditional: "true",
            data: JSON.stringify({cur_event}),
            dataType: "json"
          }).done(function(response){   
            console.log(response)
            cur_event['convex_hull'] = response;
            self.plot_polygon(self.svg_events, cur_event);
            self.events.push(cur_event);
            self.cur_event = {"points": [], "color": []};
          })       
    }

    /**
     * Draw a polygon with a path from the coordinates of polygon and in the group g.
     * @param {group} g - group to draw the polygon
     * @param {array} polygon - array of points, countour of polygon
     */
    plot_polygon(g, polygon){
        var line = d3.line();
        d3.selectAll(".marker_point").remove();
        g.append("path")
            .attr("d", line(polygon['convex_hull']))
            .attr("fill", polygon['color'])
            .attr("stroke-width", "2px")
            .attr("stroke", "#303030")
            .attr("opacity", 0.85);
    }

    /**
     * Draw events that are saved in a files.
     */
    load_data(){
        const self = this;
        var dataset = $("#dataset").val();
        fetch("http://127.0.0.1:5000/static/data/events_"+dataset+".json")
        .then(response => response.json())
        .then(function(events){
            console.log(events.map(d => d.color))
            for(let i = 0; i < events.length; i++){
                self.cur_event['points'] = events[i]['points'];
                self.cur_event['color'] = events[i]['color'];
                self.finish_polygon();
            } 
        });
    }

    /**
     * Remove all events drawn.
     */
    reset(){
       this.svg_events.selectAll("*").remove();
        fetch('http://127.0.0.1:5000/reset');
    }


    /**
     * Update procedure, first deleted all error values, than get selected values of the methods,
     * after call recursive update call.
     */
    update(){
        this.svg_results.selectAll("*").remove();
        //Erasing metrics values;
        for(let i = 0; i < this.methods.length; i++){
            for(let j = 0; j < this.metrics.length; j++){
                document.getElementById(this.metrics[j] + "_row_" + i).innerHTML = "";
            }
        }
        
        var selected_methods = [];
        console.log(this.methods)
        for(let i = 0; i < this.methods.length; i++){
            var cur_method = {}
            for(let j = 0; j < this.params.length; j++){
                cur_method[this.params[j]] = this.methods[i][this.params[j]].value;
            }
            selected_methods.push(cur_method);
        }

        console.log(selected_methods);
        this.update_call(selected_methods, 0);
    }

    /**
     * 
     * @param {array} methods - array of select methods.
     * @param {*} i - index of the current method.
     */
    update_call(methods, i){
        if(methods.length == i) return;
        const self = this;
        //Creating request for the current object
        var m = methods[i];
        var myUrl = 'http://127.0.0.1:5000/update/';
        this.params.forEach(param => {
            myUrl += m[param] + "|";
        });
        myUrl = myUrl.slice(0, -1);

        fetch(myUrl)
        .then(response => {
            if(response.status == 200){
                return response.json();
            }else{
                throw new Error("Server error");
            }
        }).then(function(response){
            //Update errors values
            self.metrics.forEach(metric => {
                document.getElementById(metric + "_row_" + i).innerHTML += round_2_decimals(response[metric + "_error"]);
            });
            
            const events = response['events'];
            self.draw_results(events, i, methods.length)
            i++;
            self.update_call(methods, i);
        })
    }

    draw_results(events, i, n){
        events = events.sort((a, b) => a.y - b.y);
        var y = d3.scaleLinear()
            .domain([d3.min(events.map(d => - d.height/2 + d.y)), 
                    d3.max(events.map(d => d.height/2 + d.y))])
            .range([ 0, 400]);
    
        var width_plot = this.results_width/n;
        var width = width_plot/events.length;
        //draw rectangles box
        this.svg_results.append("rect")
            .attr("y", 0)
            .attr("x", (i + 1) * width_plot)
            .attr("width", 3)
            .attr("height", 400)
            .attr("fill", "#303030");

        this.svg_results.append("g")
            .selectAll(".result_rect")
            .data(events)
            .enter()
            .append('rect')
                .attr("y", d => y(d.y - d.height/2))
                .attr("x", (d, j) => j * width + i * width_plot)
                .attr("height", d => y(d.height/2 + d.y) - y(-d.height/2 + d.y))
                .attr("width", width * 1.05)
                .attr("fill", d => d.color)
                .style("opacity", 0.75)
                .style("stroke", "#303030");
    }
}

$(document).ready(function(){
    var vis = new Visualization();
    vis.reset();

    $("#update").on("click", function(e){
        e.preventDefault();
        vis.update();
    });

    $("#reset").on("click", function(e){
        e.preventDefault();
        vis.reset();
    });

    $("#load").on("click", function(e){
        e.preventDefault();
        vis.load_data();
    });

    $("#new_method").on("click", function(e){
        e.preventDefault();
        vis.new_method();
    });

    $("#remove_method").on("click", function(e){
        e.preventDefault();
        vis.remove_method();
    })


});