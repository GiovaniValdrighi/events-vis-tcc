import flask
import sys
from flask import Flask, render_template, url_for, jsonify
from shapely.geometry import Polygon
import numpy as np
from flask_cors import CORS
import copy

app = Flask(__name__)
CORS(app)
import sys
import os
module_path = os.path.abspath(os.path.join('../scripts'))
sys.path.append(module_path)

from projections import *
from vertical_positioning import *
from utils import *
from metrics import *
from time import time
class Visualization:
    """
    Control the state of the javascript visualization, will maintain information about the events,
    apply vertical positioning for creating the scatter plot.
    """

    def __init__(self):
        self.events = []

    def reset(self):
        """
        Resets the visualization to its initial state.
        """
        self.events = []

    def get_event_convex_hull(self, event):
        """
        Recieves a list of points and returns the points of the exterior of the convex hull.
        
        Inputs:
            event - dictonary with the points of the event and color
        """
        points = event['points']
        hull = Polygon(points).convex_hull
        new_event = {"points": points,
                    "hull": list(hull.exterior.coords),
                    "color": event['color']}
        self.events.append(new_event)
        convex_hull_points = new_event['hull']
        return convex_hull_points

    def compute_centers(self):
        '''Function that compute mean position of points of each event'''
        for e in self.events:
            e['xcenter'] = np.mean([p[0] for p in e['points']])
            e['ycenter'] = np.mean([p[1] for p in e['points']])
    
    def projection_centers(self, projection):
        """
            Projects events centers to 1D with the projection method selected.
            
            Inputs:
                projection - string with projection method, 
                    must be one of ['hilbert', 'morton', 'pca', 'mds', 'umap', 'tsne',]
        """
        events_coords = np.array([[e['xcenter'], e['ycenter']] for e in self.events])
        return projection_selector(events_coords, projection)
      

    def compute_intersection(self):
        '''Function that compute intersection between events'''
        n = len(self.events)
        W = np.zeros((n, n))

        for i in range(n):
            poly1 = Polygon(self.events[i]['points']).convex_hull
            self.events[i]['area'] = poly1.area
            W[i, i] = self.events[i]['area']
            for j in range(i+1, n):
                intersection_value = 0
                poly2 = Polygon(self.events[j]['points']).convex_hull
                intersection_value = poly1.intersection(poly2).area

                W[i, j] = intersection_value
                W[j, i] = intersection_value

        return W
    
    def compute_metrics(self, W, Y, height, area, k = 3):
        '''Function that compute metrics for events'''
        metrics = {}
        events_coords = np.array([[e['xcenter'], e['ycenter']] for e in self.events])
        metrics['intersection_error'] = intersection_metric(Y, height, W)
        metrics['height_error'] = height_metric(height, area)
        metrics['intersection_non_zero_error'] = intersection_non_zero_metric(Y, height, W)
        metrics['intersection_zero_error'] = intersection_zero_metric(Y, height, W)
        metrics['stress_error'] = stress_measure(events_coords, Y.reshape(-1, 1))

        
        if len(Y) > 1:
            metrics['neighborhood_error'] = neighborhood_metric(Y.reshape(-1, 1), events_coords, k = k)
        else:
            metrics['neighborhood_error'] = 0.
        return metrics

    def vertical_positioning(self, projection, method, height, zeros, lambda1, tau1, tau2):
        '''Function that compute vertical positioning for events'''
        if len(self.events) == 0:
            return   
        print((projection, method, height, zeros, lambda1, tau1, tau2), file = sys.stderr)

        start = time()
        #Events ordering
        self.compute_centers()
        proj = self.projection_centers(projection)
    
        for i in range(len(self.events)):
            self.events[i]['proj'] = proj[i]

        self.events.sort(key = lambda x : x['proj'])
        W = self.compute_intersection()

        #Events vertical positioning
        subsets = compute_subsets(W)
        area = np.array([e['area'] for e in self.events])
        Y, height = vertical_position(
            area, 
            W, 
            subsets,
            method,
            height,
            zeros,
            lambda1,
            tau1,
            tau2)

        #Preparing response
        for i in range(len(self.events)):
            self.events[i]['y'] = Y[i]
            self.events[i]['height'] = height[i]
        end = time()
        metrics = self.compute_metrics(W, Y, height, area)
        metrics["time_error"] = end - start
        print(end - start, file = sys.stderr)
        return self.events, metrics


vis = Visualization()

@app.route('/index')
def index():
    url_for('static', filename='style.css')
    url_for('static', filename='script.js')
    url_for('static', filename="data/events_vertical_line.json")
    url_for('static', filename="data/events_rotated_line.json")
    return render_template('index.html')

@app.route('/reset')
def reset():
    vis.reset()
    return "", 200

@app.route('/event_convex_hull', methods = ['POST'])
def event_convex_hull():
    if flask.request.method == 'POST':
        convex_hull_points = vis.get_event_convex_hull(flask.request.get_json()['cur_event'])
        return jsonify(convex_hull_points)

@app.route('/update/<string:method>')
def update(method):
    '''Function that compute the method for events'''

    #Processing function inputs
    method = method.split("|")
    projection, method, height, zeros, lambda1, tau1, tau2 = method
    height = True if height == 'optim_height' else False
    zeros = True if zeros == 'optim_zeros' else False
    lambda1 = float(lambda1) if lambda1 != "-" else -1.0
    tau1 = float(tau1) if tau1 != "-" else -1.0
    tau2 = float(tau2) if tau2 != "-" else -1.0

    events, metrics = vis.vertical_positioning(
        projection, 
        method, 
        height, 
        zeros, 
        lambda1, 
        tau1, 
        tau2)

    response = {}
    for (key, value) in metrics.items():
        response[key] = value
    
    response['events'] = []
    for e in events:
        response['events'].append({
            'y': e['y'],
            'height': e['height'],
            'color': e['color'],
        })
    return jsonify(response)
