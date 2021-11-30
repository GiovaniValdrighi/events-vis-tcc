from shapely.geometry import Polygon
import numpy as np

def intersection_matrix(events, df_points):
    """
    Function that compute for each pair of events, the area of intersection 
    between the two convex hulls of points.

    Inputs:
        events - list with events index in order
        df_points - dataframe with rows that contain columns ['xcenter', 'ycenter', 'event']

    Outputs:
        W - numpy matrix with intersection values, considering the events ordered by their index,
        i.e., W[i, j] is the intersection between the i-th and j-th events considering their ordering 

    """

    n = len(events)
    W = np.zeros((n ,n))

    points = []
    for e in events:
        points.append(df_points.loc[df_points.event == e, ['xcenter', 'ycenter']].values)

    for i in range(n):
        for j in range(i, n):
            intersection_area = 0
            if (len(points[i]) >= 3) and (len(points[j]) >= 3):
                poly_i = Polygon(points[i]).convex_hull
                poly_j = Polygon(points[j]).convex_hull
                intersection_area = poly_i.intersection(poly_j).area
            
            W[i, j] = intersection_area
            W[j, i] = intersection_area

    return W
