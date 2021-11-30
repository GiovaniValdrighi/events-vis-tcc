import numpy as np
import cvxpy as cp
import sys
from PIL import Image

def compute_subsets(W):
    '''
    Function that recieve a matrix of intersection values for n events,
    and compute subsets of events that intersect themselves, i.e.,
    two events i and j are in a subset only if there is a sequence of events
    i1, i2, ..., ik that w[i, i1] > 0, w[i1, i2] > 0, ... , w[ik, j] > 0
    
    Inputs:
        W - numpy array [n, n]

    Output:
        subsets - list of lists, each one is a subset
    '''
    n = W.shape[0]
    already_in_subset = [0] * n  
    subsets = []

    for i in range(n):
        if already_in_subset[i] == 0:
            already_in_subset[i] = 1
            cur_subset = [i]
            stack = []
            #Find every event that has intersection bigger than 0 and add to stack
            for k in range(n):
                if k != i and already_in_subset[k] == 0:
                    intersec = W[i, k]
                    if intersec > 0:
                        stack.append(k)
                        cur_subset.append(k)
                        already_in_subset[k] = 1
            #For each group in stack find events that has intersection bigger than 0
            while len(stack) > 0:
                new_i = stack.pop()
                for k in range(n):
                    if k != new_i and already_in_subset[k] == 0:
                        intersec = W[new_i, k]
                        if intersec > 0:
                            stack.append(k)
                            cur_subset.append(k)
                            already_in_subset[k] = 1
            subsets.append(cur_subset)
    return subsets

def subset_arrays(L, W, subset):
    """
    Function that create the array of area and of intersection area
    for m events in this subset

    Inputs:
        L - numpy array [n, 1] with area
        W - numpy array [n, n] with intersection area

    Outputs:
        l_ - numpy array [m, 1] with area
        w_ - numpy array [m, m] with intersection area
    """

    m = len(subset)
    l_ = []
    w_ = np.zeros((m, m))
    for i in range(m):
        event_i = subset[i]
        l_.append(L[event_i])
        w_[i, i] = L[event_i]
        for j in range(i+1, m):
            event_j = subset[j]
            w_[i, j] = W[event_i, event_j]
            w_[j, i] = w_[i, j]

    return l_, w_

def remove_space_subsets(y_, l_):
    """
    Function that recieve position for vertical events and remove vertical empty space
    between events if there is, return the new positions in the same order as recieved

    Inputs:
        y_ - list of n floats with events positions
        l_ - list of n floats with events area

    Outputs:
        y_ - list of n floats with new events positions
    """

    n = len(y_)
    ind = list(range(n))
    ind.sort(key = lambda i : y_[i])
    min_y = min([y_[i] - l_[i]/2 for i in range(n)])
    for i in range(n):
        y_[i] -= min_y
    
    for i in range(n-1):
        if i == 0:
            end_pos = y_[ind[i]] + l_[ind[i]]/2
        else:
            end_pos = np.max([y_[j] + l_[j]/2 for j in ind[:i+1]])
        start_pos = y_[ind[i+1]] - l_[ind[i+1]]/2
        space = start_pos - end_pos
        if space > 0:
            for j in range(i+1, n):
                y_[ind[j]] -= space
    return y_

def subset_vertical(Y, L, y_, l_, subset, last_end):
    """
    Function that update the vertical positioning of n events from the 
    vertical position of the subset of m events, it also updates the position of
    the last event

    Inputs:
        Y - numpy array [n] with the y coordinate of the center of events rectangles
        L - numpy array [n] with height of events rectangles
        y_ - numpy array [m] with vertical position of subset of events
        l_ - numpy array [m, 1] with area
        subset - list of length m
        last_end - vertical position of the biggest top edge of an event
    
    Outputs:
        Y - numpy array [n] updated with values from y_
        L - numpy array [n] with height of events rectangles with updated values from l_
        last_end - vertical position of the biggest top edge of an event updated
    """

    last_event_i = 0
    for i, event in enumerate(subset):
        Y[event] = y_[i] + last_end
        L[event] = l_[i]
        if (y_[i] + l_[i]/2) > (y_[last_event_i] + l_[last_event_i]/2):
            last_event_i = i

    last_end += (y_[last_event_i] + l_[last_event_i]/2) 
    return Y, L, last_end

def greedy(L, W):
    """
    Function that compute the vertical positioning of events using the greedy method
    The first event has position equals to half its area, y_0 = l_0/2
    The following events follow the equation:

        y_i = y_{i - 1} + (l_i + l_{i - 1})/2 - w_{i, i - 1}
    
    Inputs: 
        L - numpy array [n, 1] with area
        W - numpy array [n, m] with intersection area
    
    Outputs:
        Y - numpy array [n, 1] with vertical position
    """

    m = len(L)
    Y = np.zeros(m)
    Y[0] = L[0]/2
    for i in range(1, m):
        Y[i] = Y[i - 1] + (L[i] + L[i- 1])/2 - W[i, i - 1]

    return Y, L

def mixed_integer(L, 
                  W, 
                  optim_height = False,
                  optim_zeros = True,
                  lambda1 = 0.5,
                  tau1 = 0.8,
                  tau2 = 1.2):
    """
    Function that compute the vertical positioning of events using the mixed integer method
    minimizing the error between the intersection value observed and the represented
    
    if optim_height == False

        \min_{Y, b} \sum_{i = 1}^n \sum_{j = i + 1}^n difference(W_{i, j} - I_{i, j})/(min{L_i, L_j})  * g(W_{i, j})
        subject to  Y_i < Y_{i+1} \forall i
                    I_{i, j} >= 0
                    I_{i, j} >= (Y_i + L_i/2) - (Y_j - L_j/2)
                    I_{i, j} <= M * b_{i, j}
                    I_{i, j} <- (Y_i + L_i/2) - (Y_j - L_j/2) + M * (1 - b_{i, j})
                    b_{i, j} in {0, 1} \forall i < j
                    g_(W_{i, j}) = 0 if W_{i, j} == 0 and optim_zero == False, 1 otherwise 

    if optim_height == True

        \min_{Y, b, L_hat} \sum_{i = 1}^n \sum_{j = i + 1}^n difference(W_{i, j} - I_{i, j})/(min{L_i, L_j})
                                    lambda1 * \sum_{i = 1}^n (L_i - L_hat_i)^2  
        subject to  Y_i < Y_{i+1} \forall i
                    I_{i, j} >= 0
                    I_{i, j} >= (Y_i + L_hat_i/2) - (Y_j - L_hat_j/2)
                    I_{i, j} <= M * b_{i, j}
                    I_{i, j} <- (Y_i + L_hat_i/2) - (Y_j - L_hat_j/2) + M * (1 - b_{i, j})
                    b_{i, j} in {0, 1} \forall i < j
                    tau1 * L_i <= L_hat_i \forall i 
                    L_hat_i <= tau2 * L_i \forall i
                    g_(W_{i, j}) = 0 if W_{i, j} == 0 and optim_zero == False, 1 otherwise      
    
    Inputs: 
        L - numpy array [n] with area of events
        W - numpy array [n, n] with intersection area
        optim_height - boolean if height must be optimized or not
        optim_zeros - boolean if zeros intersection will be optimized
        lambda1 - hyperparameter used in variable height method
        tau1 - hyperparameter used in variable height method for lower threshold
        tau2 - hyperparameter used in variable height method for upper threshold

    Outputs:
        Y - numpy array [n] with vertical position
        L_hat - numpy array [n] with height of events rectangles
    """
    n = len(L)
    Y = [cp.Variable(1, 'y_'+str(i)) for i in range(n)]
    if optim_height:
        L_hat = [cp.Variable(1, 'l_'+str(i)) for i in range(n)]
    else:
        L_hat = L
    M = 10000000

    f = []
    constraints = []
    I = [[0 for _ in range(n)] for _ in range(n)]
    b = [[0 for _ in range(n)] for _ in range(n)]

    for i in range(n):
        if optim_height:
            constraints.append(tau1 * L[i] <= L_hat[i])
            constraints.append(L_hat[i] <= tau2 * L[i])
            f.append(lambda1 * cp.square(L_hat[i] - L[i]))
        if i + 1 < n:
            constraints.append(Y[i] <= Y[i+1])
        for j in range(i+1, n):
            if W[i][j] != 0 or optim_zeros:
                L_min = min(L[i], L[j])
                I[i][j] = cp.Variable((1))
                b[i][j] = cp.Variable((1), boolean = True)
                
                constraints.append(I[i][j] >= 0)
                constraints.append(I[i][j] >= L_hat[i]/2 + L_hat[j]/2 + Y[i] - Y[j])
                constraints.append(I[i][j] <= M * b[i][j])
                constraints.append(I[i][j] <= L_hat[i]/2 + L_hat[j]/2 + Y[i] - Y[j] + M * (1 - b[i][j]))

                f.append(cp.square(W[i][j] - I[i][j])*1/L_min)


    prob = cp.Problem(cp.Minimize(sum(f)), constraints)
    prob.solve(solver = cp.GUROBI)
    Y = [np.float(y_i.value) for y_i in Y]
    if optim_height:
        L_hat = [np.float(l_i.value) for l_i in L_hat]
    return Y, L_hat

def vertical_position(L, 
                      W, 
                      subsets, 
                      method = 'greedy', 
                      optim_height = False,
                      optim_zeros = True,
                      lambda1 = 0.5, 
                      tau1 = 0.8, 
                      tau2 = 1.2):
    """
    Function that compute the vertical position of n events based on the area,
    the ordering and the intersection values, return the list of respective positions

    Inputs:
        L - numpy array [n] with area of events
        W - numpy array [n] with intersection area between events
        subsets - list of subsets of events
        method - string with vertical positioning method, must be ['greedy', 'exponential', 'mixed_integer']
        optim_height - boolean if height must be optimized or not, only works if method is in ['exponential', 'mixed_integer']
        optim_zeros - boolean if zeros intersection will be optimized, only works if method is in ['mixed_integer']
        lambda1 - hyperparameter used in variable length method, only works if method is in ['exponential', 'mixed_integer']
        tau1 - hyperparameter used in variable length method for lower threshold, only works if method is in ['exponential', 'mixed_integer']
        tau2 - hyperparameter used in variable length method for upper threshold, only works if method is in ['exponential', 'mixed_integer']

    Outputs:
        Y - numpy array [n] with the y coordinate of the center of events rectangles
        L - numpy array [n] with height of events rectangles
    """

    n = L.shape[0]
    Y = np.zeros(n)
    last_end = 0

    for subset in subsets:
        l_, w_ = subset_arrays(L, W, subset)
        if len(subset) <= 2:
            y_, l_ = greedy(l_, w_)
        else:
            
            if method == 'greedy':
                y_, l_ = greedy(l_, w_)
            elif method == 'mixed_integer':
                y_, l_ = mixed_integer(l_, w_, optim_height, optim_zeros, lambda1, tau1, tau2)

        y_ = remove_space_subsets(y_, l_)
        Y, L, last_end = subset_vertical(Y, L, y_, l_, subset, last_end)
    return Y, L

def inner_points(
    df_points,
    df_events
    ):
    '''
    Function that uses the vertical position and area of each group, and the point order of data
    to compute the vertical position of points

    Inputs:
        points_proj - numpy array [m] with the proj value of points
        points_event - numpy array [m] with the event index of each point
        Y - numpy array [n] with the vertical position of events
        L - numpy array [n] with the height of events

    '''
    points_y = np.zeros(shape = df_points.shape[0])
    points_height = np.zeros(shape = df_points.shape[0])
    
    for _, row in df_events.iterrows():
        e = row['event']
        event_bool = np.where(df_points.event.values == e)[0]
        total_points = df_points[df_points['event'] == e].proj.max()
        if total_points == 0:
            const_height = 0
        else:
            const_height = row['area'] / total_points
        points_height[event_bool] = const_height
        points_y[event_bool] = (row['y'] - row['area']/2 + 
            const_height * df_points[df_points['event'] == e]['proj'])
    
    return points_y, points_height

def colormap2D(data, colormap = 'ziegler'):
    for i in range(2):
        data[:, i] = (data[:, i] - data[:, i].min())/(data[:, i].max() - data[:, i].min()) * 511
    data = np.floor(data)
    data = data.astype(np.int64)
    colormap = np.array(Image.open(f"../data/colormap/{colormap}.png"))
    colors = colormap[(511 - data[:, 1]), data[:, 0], :]
    return colors