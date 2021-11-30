import numpy as np
from hilbertcurve.hilbertcurve import HilbertCurve
from scipy.stats import rankdata
import pymorton as pm
import umap
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE, MDS
import sys 

a = 13456
def projection_selector(data, projection_name, order = False):
    """
    Call the respective projection method from selections.
    Inputs:
        data - numpy array [n, 2]
        projection_name - name of projection function to be called
        order - boolean if should return original transformation or apply ordering

    Output:
        proj - numpy array [n]
    """
    if projection_name == "mds_metric":
        proj = mds_proj(data, metric = True, order = order)
    elif projection_name == "mds_non_metric":
        proj = mds_proj(data, metric = False, order = order)
    elif projection_name == 'pca':
        proj = pca_proj(data, order = order)
    elif projection_name == 'hilbert':
        proj = hilbert_proj(data, order = order)
    elif projection_name.find('hilbert') != -1:
        projection_name, level = projection_name.split('_')
        proj = hilbert_proj(data, level = int(level), order = order)
    elif projection_name == "morton":
        proj = morton_proj(data, order = order)
    elif projection_name.find("morton") != -1:
        projection_name, level = projection_name.split('_')
        proj = morton_proj(data, level = int(level), order = order)
    elif projection_name == "tsne":
        proj = tsne_proj(data, order = order)
    elif projection_name == "umap":
        proj = umap_proj(data, order = order)
    return proj

def pca_proj(data, order = False):
    """
    Project 2D data to 1D using PCA

    Inputs:
        data - numpy array [n, 2]
        order - boolean if should return original transformation or apply ordering

    Outputs:
        proj - numpy array [n]
    """
    pca = PCA(n_components= 1)
    pca.fit(data)
    proj = pca.transform(data)
    if order:
        proj = rankdata(proj, 'dense')
    return proj

def mds_proj(data, metric = True, order = False):
    """
    Project 2D data to 1D using MDS

    Inputs:
        data - numpy array [n, 2]
        metric - boolen if should use metric or non-metric MDS
        order - boolean if should return original transformation or apply ordering

    Outputs:
        proj - numpy array [n]
    """
    mds = MDS(n_components= 1, metric = metric)
    proj = mds.fit_transform(data)
    if order:
        proj = rankdata(proj, 'dense')
    return proj

def tsne_proj(data, order = False):
    """
    Project 2D data to 1D using t-SNE

    Inputs:
        data - numpy array [n, 2]
        order - boolean if should return original transformation or apply ordering
    
    Outputs:
        proj - numpy array [n]

    """
    tsne = TSNE(n_components=1, perplexity = 30, learning_rate = 500)
    proj = tsne.fit_transform(data)
    if order:
        proj = rankdata(proj, 'dense')
    return proj

def umap_proj(data, order = False):
    """
    Project 2D data to 1D using UMAP

    Inputs:
        data - numpy array [n, 2]
        order - boolean if should return original transformation or apply ordering
      
    Outputs:
        proj - numpy array [n]
    """
    reducer = umap.UMAP(n_components = 1) #n_neighbors = min(8, data.shape[0] - 1))
    reducer.fit(data)
    proj = reducer.transform(data) 
    if order:
        proj = rankdata(proj, 'dense')
   
    return proj

def hilbert_proj(data, level = 5, order = False):
    """
    Project 2D data to 1D using Hilbert space-filling curve

    Inputs:
        data - numpy array [n, 2]
        level - int order of curve
        order - boolean if should return original transformation or apply ordering

    Output:
        proj - numpy array [n]

    """
    curve = HilbertCurve(level, 2)

    for i in range(2):
        data[:, i] = data[:, i] - data[:, i].min()
        data[:, i] = data[:, i] / data[:, i].max()
        data[:, i] = data[:, i] * (2**(level) - 1)
    data = data.astype(np.uint32)
    data = data.tolist()
    proj = curve.distances_from_points(data)
    if order:
        proj = rankdata(proj, 'dense')
    return proj

def morton_proj(data, level = 5, order = False):
    """
    Project 2D data to 1D using Morton space-filling curve

    Inputs:
        data - numpy array [n, 2]
        level - int order of curve
        order - boolean if should return original transformation or apply ordering

    Output:
        proj - numpy array [n]
        transformation function

    """
    for i in range(2):
        data[:, i] = data[:, i] - data[:, i].min()
        if data[:, i].max() != 0:
            data[:, i] = data[:, i] / data[:, i].max()
        else:
            data[:, i] = 0
        data[:, i] = data[:, i] * (2**(level) - 1)
    data = data.astype(np.uint32)

    proj = np.array([pm.interleave2(int(coord[0]), int(coord[1])) for coord in data])

    if order:
        proj = rankdata(proj, 'dense')
    return proj
