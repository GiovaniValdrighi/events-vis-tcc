class ParallelCoordinates {
	
	constructor(vis, container, dimensions_config){

		this._vis = vis;
		this._container = container;
		this._x = null;
		this._y = null;
		this._svg = null;
		this._dimensions = null;
		this._dimensions_config = dimensions_config;
	}


	draw(){
		var data = this._vis.data.events;

		// set the dimensions and margins of the graph
		var margin = {top: 30, right: 30, bottom: 20, left: 40},
			width = 760 - margin.left - margin.right,
			height = 160 - margin.top - margin.bottom;


	    var x = d3.scalePoint()
	    	.range([0, width])
		//.padding(1);
	        
	    var y = {};

	    let line = d3.line(),
	        axis = d3.axisLeft(),
	        background,
	        foreground;
		
	
		// append the svg object to the body of the page
		var svg = d3.select(this._container)
			.append("svg")
			  .attr("width", width + margin.left + margin.right)
			  .attr("height", height + margin.top + margin.bottom)
			  .attr("id", "parallel_svg")
			.append("g")
			  .attr("transform",
			        "translate(" + margin.left + "," + margin.top + ")")

		// Extract the list of dimensions and create a scale for each.
		var dimensions = this._dimensions_config.map(d => d.name) 
		for(let i = 0; i < dimensions.length; i++){
			let d = dimensions[i]
			y[d] = d3.scaleLog().clamp(true)
								.domain([Math.max(1,d3.min(data, function(p) { return +p[d]; })), 
									d3.max(data, function(p) { return +p[d]; })])
								.range([height, 0]);
		}
	
	 	
	 	x.domain(dimensions);

		//let path = line(dimensions.map(function(p) { 
		//	return [x(p), y[p](d[p])]; 
		//}));

        // Add grey background lines for context.
        background = svg.append("g")
            .attr("class", "background")
          .selectAll("path")
            .data(data)
          .enter().append("path")
            .attr("d", function(d){ 
            	return line(dimensions.map(function(p) { 
					return [x(p), y[p](d[p])]; 
				}))
			});

        // Add blue foreground lines for focus.
        foreground = svg.append("g")
            .attr("class", "foreground")
          .selectAll("path")
            .data(data)
          .enter().append("path")
			.attr("d", function(d){ 
            	return line(dimensions.map(function(p) { 
					return [x(p), y[p](d[p])]; 
				}))
			});

        // Add a group element for each dimension.
        let g = svg.selectAll(".dimension")
            .data(dimensions)
          .enter().append("g")
            //.attr("class", "dimension")
            .attr("class", function(d){
            	return "dimension dimension_" + d 
            })
            .attr("transform", function(d) { return "translate(" + x(d) + ")"; });

        let onZoom = this.onZoom;
		var self = this;
        // Add an axis and title.
        g.append("g")
            .attr("class", function(d){
            	return "axis axis_" + d 
            })
            .attr("id", function(d){
            	return d 
            })
            .each(function(d) { 
            	d3.select(this).call(axis.scale(y[d]));

            	d3.select(this).call(y[d].zoom = d3.zoom()
					.scaleExtent([1, 10])  // This control how much you can unzoom (x0.5) and zoom (x20)
					.extent([[0, 0], [width, height]])
					.on("zoom", function(event, id){
						
						let dimension = id;
						y[dimension].domain(d3.extent(data, function(p) { return +p[dimension]; }))

						let x = self._x;
						let newY = event.transform.rescaleY(y[dimension]);
						y[dimension].domain(newY.domain())
						d3.select(this).call(d3.axisLeft(newY))


						let dimensions = self._dimensions;
						d3.select(".foreground")
							.selectAll("path")        
							.attr("d", function(d){
								return d3.line()(dimensions.map(function(p) { 
									if (p == dimension){
										return [x(p), newY(d[p])]; 
									}
									return [x(p), y[p](d[p])]; 
								}))
							});

						d3.select(".background")
							.selectAll("path")        
							.attr("d", function(d){
								return d3.line()(dimensions.map(function(p) { 
									if (p == dimension){
										return [x(p), newY(d[p])]; 
									}
									return [x(p), y[p](d[p])]; 
								}))
							});
					})
				)
            })
			.append("text")
				.style("text-anchor", "middle")
				.style("fill", "black")
				.attr("y", -9)
				.text(function(d) { 
					return self._dimensions_config.filter(e => e.name == d)[0].label
				});

        // Add and store a brush for each axis.
        this._x = x;
        this._y = y;
        this._svg = svg;
        this._dimensions = dimensions;

		
        let onBrushEnd = this.onBrushEnd;
        let restart = this.restart;

        g.append("g")
            .attr("class", "brush")
            .each(function(d) { 
                d3.select(this).call(y[d].brush = d3.brushY()
					.extent([[-10,0], [10,height]])
					//.on("brush", brush)           
					.on("end", function(){
						onBrushEnd(self)})
				)


			})
			.selectAll("rect")
				.attr("x", -8)
				.attr("width", 16);
            	
        d3.selectAll(this._container)
        	.on("dblclick", function(){
				restart(self)})


				console.log("CHETOU ATÉ O FINAL")
	}

	onZoom(event, id){

		const self = this;
		let dimension = id;
 		let y = self._y
 		let data = self._vis.data.grouped;

		y[dimension].domain(d3.extent(data, function(p) { return +p[dimension]; }))

 		let x = self._x;
 		let newY = event.transform.rescaleY(y[dimension]);
 		y[dimension].domain(newY.domain())
 		d3.select(this).call(d3.axisLeft(newY))


    	let dimensions = self._dimensions;
		d3.select(".foreground")
			.selectAll("path")        
	        .attr("d", function(d){
	        	return d3.line()(dimensions.map(function(p) { 
					if (p == dimension){
						return [x(p), newY(d[p])]; 
					}
					return [x(p), y[p](d[p])]; 
				}))
			});

	    d3.select(".background")
			.selectAll("path")        
	        .attr("d", function(d){
	        	return d3.line()(dimensions.map(function(p) { 
					if (p == dimension){
						return [x(p), newY(d[p])]; 
					}
					return [x(p), y[p](d[p])]; 
				}))
			});

	}

    restart(self){
    	let data = self._vis.grouped_data;
    	let dimensions = self._dimensions;
    	let y = self._y;
    	let x = self._x;

    	for(let d of dimensions){
    		let selected_axis = d3.select(".axis_"+d)
    		let y = self._y[d];
    		y.domain(d3.extent(data, function(p) { return +p[d]; }))
		    selected_axis.call(d3.axisLeft().scale(y)); 
	    	d3.select(".dimension_"+d).select(".brush").call(y.brush.move, null);
    	}


    	d3.select(".foreground")
			.selectAll("path")        
	        .attr("d", function(d){
	        	return d3.line()(dimensions.map(function(p) { 
					return [x(p), y[p](d[p])]; 
				}))
			});

	    d3.select(".background")
			.selectAll("path")        
	        .attr("d", function(d){
	        	return d3.line()(dimensions.map(function(p) { 
					return [x(p), y[p](d[p])]; 
				}))
			});


    }

	onBrushEnd(self){
    	let actives = [];
    	let svg = self._svg;
    	let y = self._y;
    	let x = self._x;
    	let dimensions = self._dimensions;


        svg.selectAll(".brush")
	        .filter(function(d) {
	              y[d].brushSelectionValue = d3.brushSelection(this);
	              return d3.brushSelection(this);
	        })
	        .each(function(d) {
	            // Get extents of brush along each active selection axis (the Y axes)
	              actives.push({
	                  dimension: d,
	                  extent: d3.brushSelection(this).map(y[d].invert)
	              });
	        });

        var selected = [];
        // Update foreground to only display selected values
        d3.select(".foreground")
        	.selectAll("path")
        	.style("display", function(d) {
	          	let isActive = actives.every(function(active) {
	              	let result = active.extent[1] <= d[active.dimension] && 
	              					d[active.dimension] <= active.extent[0];
	      			return result;
				});
				// Only render rows that are active across all selectors
	        	if(isActive) selected.push(d);
	        	return (isActive) ? null : "none";
        	});

        self.updateComponents(selected);

    }

	updateComponents(selected){
		console.log(selected) 
		var selected_events = selected.map(d => d.event)
		this._vis.set_filtered_data(selected_events); 
    }
}