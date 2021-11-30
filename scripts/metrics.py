import numpy as np
from sklearn.neighbors import NearestNeighbors
from sklearn.manifold import trustworthiness
from sklearn.metrics import euclidean_distances

def intersection_metric(Y, L, W):
    """
    Function that compute the intersection metric for n evens with vertical positions y_i
    and height equals to l_i and for each pair i, j a intersection value w_{i, j}

    Inputs:
        Y - numpy array [1xn] with events rectangles vertical position
        L - numpy array [1xn] with rectangles height
        W - numpy array [nxn] with events intersection (objective)

    Outputs:
        error - metric error value
    """
    n = len(L)
    error = 0
    W = np.where( W >= 0, W, 0)

    for i in range(n):
        for j in range(i+1, n):
            I = max(0, L[i]/2 + L[j]/2 - abs(Y[i] - Y[j]))
            error += abs(W[i, j] - I)

    error /= W.sum()
    return error

def intersection_non_zero_metric(Y, L, W):
    """
    Function that compute the intersection metric for n evens with vertical positions y_i
    and height equals to l_i and for each pair i, j a intersection value w_{i, j} if w_{i, j} > 0

    Inputs:
        Y - numpy array [1xn] with events rectangles vertical position
        L - numpy array [1xn] with rectangles height
        W - numpy array [nxn] with events intersection (objective)

    Outputs:
        error - metric error value
    """
    n = len(L)
    error = 0
    W = np.where( W >= 0, W, 0)

    for i in range(n):
        for j in range(i+1, n):
            I = max(0, L[i]/2 + L[j]/2 - abs(Y[i] - Y[j]))
            if W[i, j] > 0:
                error += abs(W[i, j] - I)

    error /= W.sum()
    return error

def intersection_zero_metric(Y, L, W):
    """
    Function that compute the intersection metric for n evens with vertical positions y_i
    and height equals to l_i and for each pair i, j a intersection value w_{i, j} if w_{i, j} = 0

    Inputs:
        Y - numpy array [1xn] with events rectangles vertical position
        L - numpy array [1xn] with rectangles height
        W - numpy array [nxn] with events intersection (objective)

    Outputs:
        error - metric error value
    """
    n = len(L)
    error = 0
    W = np.where( W >= 0, W, 0)

    for i in range(n):
        for j in range(i+1, n):
            I = max(0, L[i]/2 + L[j]/2 - abs(Y[i] - Y[j]))
            if W[i, j] == 0:
                error += abs(W[i, j] - I)

    error /= W.sum()
    return error

def neighborhood_metric(Y, Y_hat, k = 5):
    """
    Function that compute the neighborhood metric for n events,
    with the vertical position of the rectangles and the original position of events,
    for each compute the neighborhood and evaluate the intersection between 
    real and represented neighborhoods

    Inputs:
        Y -  numpy array [1xn] with events rectangles vertical position
        Y_hat - numpy array [2xn] with events original position 

    Ouputs:
        error - metric error value
    """
    k = min(Y.shape[0] -1, k)
    nbrs_Y = NearestNeighbors(n_neighbors = k + 1).fit(Y)
    _, indices_Y = nbrs_Y.kneighbors(Y)
    
    nbrs_Y_hat = NearestNeighbors(n_neighbors = k + 1).fit(Y_hat)
    _, indices_Y_hat = nbrs_Y_hat.kneighbors(Y_hat)
    
    error = 0
    for i in range(Y.shape[0]):
        error += (1 - len(np.intersect1d(indices_Y[i, 1:], indices_Y_hat[i, 1:]))/k)
    
    error /= Y.shape[0]
    return error

def trustworth_metric(Y, Y_hat, k = 5):
    """
    Function that compute the trustworthiness metric for n events

    Inputs:
        Y -  numpy array [1xn] with events rectangles vertical position
        Y_hat - numpy array [2xn] with events original position 
        k - number of neighboors to consider

    Ouputs:
        error - metric error value
    """
    error = trustworthiness(Y, Y_hat, n_neighbors= k)
    return error

def height_metric(L, L_hat):
    """
    Function that compute the height metric for n events,
    the square distance between the area of the events and the
    height of the events rectangles after vertical positioning

    Inputs: 
        L - numpy array [n] with events area
        L_hat - numpy array[n] with events rectangles height

    Ouputs:
        error - metric error value
    """
    L = np.array(L)
    L_hat = np.array(L_hat)
    error = 0
    for i in range(L.shape[0]):
        error += abs(L[i] - L_hat[i])/L[i]
    error /= L.shape[0]
    return error

def stress_measure(Y, Y_hat):
    """
    Compute the stress measure (MDS loss function) for the two vectors Y and Y_hat.

    stress = \sqrt{\sum_{i = 1}^n \sum_{j = i}^n (d*_{i, j} - d_{i, j})^2 / 
                    \sum_{i = 1}^n \sum_{j =i}^n (d_{i, j})^2}

    
    Inputs:
        Y - numpy array [d x n] with coordinates 
        Y_hat - numpy array [n] with projected positions
    
    Outputs:
        S - metric error value in [0, 1]
    """

    Y = np.array(Y).astype(np.float32)
    Y_hat = np.array(Y_hat).astype(np.float32)

    old_d = euclidean_distances(Y)
    old_d /= old_d.max()

    new_d = euclidean_distances(Y_hat)
    new_d /= new_d.max()

    stress = np.power(new_d - old_d, 2).sum() * 0.5
    stress1 = np.sqrt(stress / (0.5 * np.power(old_d, 2).sum()))
    return stress1

    n = Y.shape[0]
    numerator = 0.0
    denominator = 0.0

    # Calculate max distance to normalize 
    max_dij = -1
    max_dij_hat = -1
    for i in range(n):
        for j in range(i+1, n):
            d_ij = np.linalg.norm(Y[i, :] - Y[j, :])
            max_dij = d_ij if d_ij > max_dij else max_dij
            d_ij_hat = np.linalg.norm(Y_hat[i] - Y_hat[j])
            max_dij_hat = d_ij_hat if d_ij_hat > max_dij_hat else max_dij_hat

    max_dij = 1 if max_dij == 0 else max_dij
    max_dij_hat = 1 if max_dij_hat == 0 else max_dij_hat

    for i in range(n):
        for j in range(i+1, n):
            d_ij = np.linalg.norm(Y[i, :] - Y[j, :])/max_dij
            d_ij_hat = np.linalg.norm(Y_hat[i] - Y_hat[j])/max_dij_hat
            numerator += (d_ij - d_ij_hat)*(d_ij - d_ij_hat)
            denominator += (d_ij)*(d_ij)
    
    S = np.sqrt(numerator/denominator)
    return S
