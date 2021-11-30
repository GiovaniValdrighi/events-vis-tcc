from flask import Flask, render_template, url_for, jsonify, request
import numpy as np
import pandas as pd
from flask_cors import CORS


import sys
import os
module_path = os.path.abspath(os.path.join('../scripts'))
sys.path.append(module_path)
from projections import *
from vertical_positioning import *
from utils import *

app = Flask(__name__)
CORS(app)
vis = None

variable_test = 123456

class Visualization:
    """
    Control the state of the javascript visualization, will maintain information about the currently dataset,
    the filtering of the dataset and apply the method for creating the scatter plot.
    """
    def __init__(self):
        self.dataset_name = None
        self.data = {"points": None, "events": None, "filtered": None}
        return

    def set_dataset(self, dataset_name):
        """Set the current dataset used for the visualization"""
        self.dataset_name = dataset_name
        self.data["points"] = pd.read_csv("static/data/" + self.dataset_name + "_points.csv")
        self.data["events"] = pd.read_csv("static/data/" + self.dataset_name + "_events.csv")
        self.data["filtered_points"] = self.data["points"].copy()
        self.data["filtered_events"] = self.data["events"].copy()

    def get_complete_data(self):
        """Return the points dataset and events dataset"""
        return self.data["points"], self.data["events"]

    def set_filtered_data(self, events):
        """Filter the dataset based on selected events"""
        bool_event = self.data["events"].event.isin(events)
        bool_point = self.data["points"].event.isin(events)
        self.data["filtered_events"] = self.data["events"][bool_event]
        self.data["filtered_points"] = self.data["points"][bool_point]
        return self.data["filtered_events"]

    def project(self, projection_name, df):
        """Call the selected projection function on the data"""
        events_coords = df[['xcenter', 'ycenter']].values
        #print(events_coords.shape)
        proj = projection_selector(events_coords, projection_name, True)
        return proj

    def get_scatter_data(self, projection_name, intersections):
        df_events = self.data["filtered_events"].copy()
        df_points = self.data["filtered_points"].copy()
        df_events = df_events.sort_values("event")
        df_points = df_points.sort_values("event")

        #print(df_points.isna().sum(), file = sys.stderr)

        #Project events
        df_events['proj'] = self.project(projection_name, df_events) 
        df_events = df_events.sort_values("proj")
        print(df_events.proj, file = sys.stderr)
        #compute intersection between events
        L = df_events.area.values
        print(df_points, file = sys.stderr)
        W = intersection_matrix(df_events.event.tolist(), df_points)
        print(W, file = sys.stderr)
        #compute subset of events that intersect themselves
        subsets = compute_subsets(W)
        print(subsets, file = sys.stderr)
        #apply greedy or optimization on each subset
        print(vertical_position(L, W, subsets, intersections))
        df_events['y'], df_events["area"] = vertical_position(L, W, subsets, intersections)
        
        
        #projection of points in each event
        for e in df_events.event.unique():
            df_points.loc[df_points.event == e, 'proj'] = self.project(projection_name, df_points.loc[df_points.event == e])
        print(df_events, file = sys.stderr)
        events = df_events.event.unique()
        events.sort()
        df_points['y'], df_points['height'] = inner_points(df_points, df_events)
        df_points["color"] = colormap2D(df_points[['xcenter', 'ycenter']].values).tolist()
        return df_events, df_points

    def get_colorbar_data(self):
        """Apply a 2D colormap on the events based on their spatial position"""
        df = self.data["filtered"].copy()
        sample_points = df[["xcenter", "ycenter"]].sample(n = 500, replace = False).to_numpy()
        self.data["colorbar"] = pd.DataFrame({"xcenter": sample_points[:, 0], 
                                            "ycenter": sample_points[:, 1]})
        color = colormap2D(sample_points).tolist()
        proj = self.mapper(sample_points)
        self.data["colorbar"]["y"] = proj
        self.data["colorbar"]["color"] = color
        return self.data["colorbar"]



@app.route('/index')
def index():
    global vis
    vis = Visualization()
    url_for('static', filename='script.js')
    return render_template('index.html')

@app.route("/set_dataset", methods=["POST"])
def set_dataset():
    if request.method == "POST":
        global vis
        vis.set_dataset(request.get_json()['dataset'])
    return '', 200

@app.route('/get_complete_data')
def get_complete_data():
    global vis
    df_points, df_events = vis.get_complete_data()
    return jsonify({"points" : df_points.to_dict(orient = 'records'),
                    "events" : df_events.to_dict(orient = 'records')})

@app.route('/set_filtered_data', methods = ['POST'])
def set_filtered_data():
    if request.method == 'POST':
        global vis
        vis.set_filtered_data(request.get_json()['selected_events'])
    return '', 200

@app.route('/get_scatter_data/<string:method>')
def get_scatter_data(method):
    '''Function that compute the method for events'''

    projection_name, intersections = method.split("|")
    global vis
    df_events, df_points = vis.get_scatter_data(projection_name, intersections)

    return jsonify({"points" : df_points.to_dict(orient = 'records'),
                    "events" : df_events.to_dict(orient = 'records')})
