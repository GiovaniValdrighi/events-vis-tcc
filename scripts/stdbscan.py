from datetime import timedelta
import numpy as np
from sklearn.neighbors import KDTree

import warnings
warnings.filterwarnings('ignore')
 
class STDBSCAN(object):
    def __init__(self, eps1=500, eps2=3600, min_pts=3):
        
        """
        STDBSCAN implementation.

        Inputs:
            eps1 - float, threshold for the spatial neighborhood.
            eps2 - float, threshold for the temporal neighborhood (in seconds).
            min_pts - int, minimum number of neighbors to consider a cluster.

        """
        self.eps1 = eps1
        self.eps2 = eps2
        self.min_pts = min_pts

    def _filter_time(self, point, matrix):
        """Filter temporal neighboorhood of point."""
        min_time = point[3] - self.eps2
        max_time = point[4] + self.eps2
        boolean_time = (matrix[:,4] < min_time) | (matrix[:,3] > max_time)
        neighborhood = matrix[np.logical_not(boolean_time), :]
        return neighborhood
    
    def _filter_space(self, point, matrix):
        """Filter spatial neighborhood of point."""
        boolean_space = self.tree.query_radius(point[1:3].reshape(1, -1), r = self.eps1)[0]
        neighborhood = matrix[boolean_space, : ]
        return neighborhood
    
    def _filter_subtype(self, point, matrix):
        """Filter neighborhood of point with sane subtype."""
        neighborhood = matrix[point[5] == matrix[:, 5], :]
        return neighborhood

    def _retrieve_neighbors(self, index_center, matrix):
        """Retrieve neighbors of point using the intersection of spatial, temporal and subtype neighborhoods."""
        center_point = matrix[index_center, :]
        neighborhood = self._filter_space(center_point, matrix)
        neighborhood = self._filter_time(center_point, neighborhood)
        neighborhood = self._filter_subtype(center_point, neighborhood)

        neighborhood = neighborhood[:, 0].tolist()
        neighborhood = [int(x) for x in neighborhood]
        neighborhood.remove(index_center)
        return neighborhood

    def fit_transform(self, df, col_x, col_y, col_start_time, col_end_time, col_subtype):
        """
        Inputs:
            df - dataframe input.
            col_x - string with x position column name.
            col_y - string with y position column name.
            col_start_time - strig with start time column name.
            col_end_time - strig with end time column name.
            col_subtype - string with subtype column name.

        Outputs:
            clusters_labels - list of clusters labels.
        """
        self.cluster_label = 0
        self.noise = -1
        self.unmarked = -9999
        
        # initial setup
        df = df[[col_x, col_y, col_start_time, col_end_time, col_subtype]]
        matrix = df.values
        #Matrix 
        # id column | x | y | start_time | end_time | subtype | cluster_label
        matrix = np.concatenate([np.arange(matrix.shape[0]).reshape(-1, 1), 
                                matrix, 
                                np.ones(matrix.shape[0]).reshape(-1, 1)*self.unmarked], 
                            axis = 1)
        self.tree = KDTree(matrix[:, 1:3])
        stack = []

        for index in range(matrix.shape[0]):
            if matrix[index, 6] == self.unmarked:
                neighborhood = self._retrieve_neighbors(index, matrix)
                #too little neighbors
                if len(neighborhood) < self.min_pts:
                    matrix[index, 6] = self.noise
                else:  # found a core point
                    self.cluster_label += 1
                    # assign a label to core point
                    matrix[index, 6] = self.cluster_label

                    # assign core's label to its neighborhood
                    for neig_index in neighborhood:
                        matrix[neig_index, 6] = self.cluster_label
                        stack.append(neig_index)  # append neighbors to stack

                    # find new neighbors from core point neighborhood
                    while len(stack) > 0:
                        current_point_index = stack.pop()
                        new_neighborhood = self._retrieve_neighbors(current_point_index, matrix)

                        # current_point is a new core
                        if len(new_neighborhood) >= self.min_pts:
                            for neig_index in new_neighborhood:
                                neig_cluster = matrix[neig_index, 6]
                                if any([neig_cluster == self.noise,
                                        neig_cluster == self.unmarked]):
                                    matrix[neig_index, 6] = self.cluster_label
                                    stack.append(neig_index)
        
        clusters_labels = matrix[:, 6]
        return clusters_labels