import R from "ramda";
import makePromiseQueue from "./makePromiseQueue";
import makeNamedMutations from './makeNamedMutations'
import { convertShorthandSchema } from './schemaHelpers'

// TODO: Check if order ONE edgeProps are not in addEdges or deleteEdges

const ONE = "ONE";

const passPromiseRejection = reason => Promise.reject(reason);

////////////////////////////////////////////////////

const makeMutator = (schema_, rootRef, log) => {
  const schema = convertShorthandSchema(schema_)
  const getScalars = (nodeData, nodeType) => {
    const nodeData_ = nodeData || {};
    return R.pick(R.keys(schema[nodeType].scalars), nodeData_);
  };

  const getEdges = (nodeData, nodeType) => {
    const nodeData_ = nodeData || {};
    return R.pick(R.keys(schema[nodeType].edges), nodeData_);
  };

  const getNodeData = (nodeType, nodeId) => {
    return rootRef
      .child(`${nodeType}/${nodeId}`)
      .once("value")
      .then(snapshot => {
        return Promise.resolve(snapshot.val());
      });
  };

  const promiseQueue = makePromiseQueue();

  // queueing is so that queries to the db don't overlap
  // const updateNode = props => promiseQueue.add(() => applyUpdate(props));

  ////////////////////////////////////////////////////

  const getUpdates = (
    {
      nodeType,
      nodeId,
      isCreation = false,
      isDeletion = false,
      isCrossUpdate = false,
      setScalars = {},
      setEdges = {},
      addEdges = {},
      deleteEdges = {}
    }
  ) => {
    ////////////////////////////////////////////////////
    const allEdgePropList = schema[nodeType].edges;
    const rootPath = `${nodeType}/${nodeId}`;

    const makeUpdates = ({ nodeEdges, nodeScalars }) => {
      // console.log({ allEdgePropList });
      let allUpdates = {};
      let allCrossActions = [];

      if (isDeletion) {
        let allDeletedDupPaths = nodeId ? [rootPath] : [];

        const edgePropMapper = (edgePropInfo, edgeProp) => {
          const {
            type,
            order,
            toOrder,
            toEdgeProp
          } = edgePropInfo;

          let deleteCrossActions = [];
          let deletedDupPaths = [];

          if (order === ONE) {
            const currentEdgeId = nodeEdges[edgeProp];
            if (toOrder === ONE) {
              deleteCrossActions = currentEdgeId
                ? [
                    {
                      nodeType: type,
                      isCrossUpdate: true,
                      nodeId: currentEdgeId,
                      setEdges: { [toEdgeProp]: null }
                    }
                  ]
                : [];
            } else {
              deleteCrossActions = currentEdgeId
                ? [
                    {
                      nodeType: type,
                      isCrossUpdate: true,
                      nodeId: currentEdgeId,
                      deleteEdges: { [toEdgeProp]: [nodeId] }
                    }
                  ]
                : [];
              deletedDupPaths = currentEdgeId
                ? [`${type}${toEdgeProp}/${currentEdgeId}/${nodeId}`]
                : [];
            }
          } else {
            const currentNodeEdges = R.keys(nodeEdges[edgeProp]) || [];
            const deletedEdges = currentNodeEdges;
            if (toOrder === ONE) {
              deleteCrossActions = R.map(
                edgeId => ({
                  nodeType: type,
                  isCrossUpdate: true,
                  nodeId: edgeId,
                  setEdges: { [toEdgeProp]: null }
                }),
                deletedEdges
              );
            } else {
              deleteCrossActions = R.map(
                edgeId => ({
                  nodeType: type,
                  isCrossUpdate: true,
                  nodeId: edgeId,
                  deleteEdges: { [toEdgeProp]: [nodeId] }
                }),
                deletedEdges
              );
              deletedDupPaths = R.map(
                edgeId => `${type}${toEdgeProp}/${edgeId}/${nodeId}`,
                deletedEdges
              );
            }
          }

          allCrossActions = [...allCrossActions, ...deleteCrossActions];
          allDeletedDupPaths = [...allDeletedDupPaths, ...deletedDupPaths];
        };

        R.mapObjIndexed(edgePropMapper, allEdgePropList);

        const deletionUpdates = R.mergeAll(
          R.map(path => ({ [path]: null }), allDeletedDupPaths)
        );

        allUpdates = deletionUpdates;
      } else {
        ///////////// If not deletion
        let allToBeDupPaths = nodeId ? [rootPath] : [];
        let allDeletedDupPaths = [];
        let allPropUpdates = [];

        const edgePropMapper = (edgePropInfo, edgeProp) => {
          const {
            type,
            order,
            toOrder,
            toEdgeProp
          } = edgePropInfo;

          let propUpdates = [];
          let deleteCrossActions = [];
          let addCrossActions = [];
          let deletedDupPaths = [];
          let toBeDupPaths = [];

          if (order === ONE) {
            const currentEdgeId = nodeEdges[edgeProp];
            let edgeId = setEdges[edgeProp];
            if (edgeId === undefined) {
              edgeId = currentEdgeId;
            }
            if (edgeId !== undefined) {
              propUpdates = [{ [edgeProp]: edgeId }];
            }

            if (toOrder === ONE) {
              if (edgeId !== currentEdgeId) {
                deleteCrossActions = currentEdgeId
                  ? [
                      {
                        nodeType: type,
                        isCrossUpdate: true,
                        nodeId: currentEdgeId,
                        setEdges: { [toEdgeProp]: null }
                      }
                    ]
                  : [];
                addCrossActions = [
                  {
                    nodeType: type,
                    isCrossUpdate: true,
                    nodeId: edgeId,
                    setEdges: { [toEdgeProp]: nodeId }
                  }
                ];
              }
            } else {
              if (edgeId !== currentEdgeId) {
                deleteCrossActions = currentEdgeId
                  ? [
                      {
                        nodeType: type,
                        isCrossUpdate: true,
                        nodeId: currentEdgeId,
                        deleteEdges: { [toEdgeProp]: [nodeId] }
                      }
                    ]
                  : [];
                addCrossActions = [
                  {
                    nodeType: type,
                    isCrossUpdate: true,
                    nodeId: edgeId,
                    addEdges: { [toEdgeProp]: [nodeId] }
                  }
                ];
              }
              toBeDupPaths = edgeId
                ? [`${type}${toEdgeProp}/${edgeId}/${nodeId}`]
                : [];
              deletedDupPaths = currentEdgeId && currentEdgeId !== edgeId
                ? [`${type}${toEdgeProp}/${currentEdgeId}/${nodeId}`]
                : [];
            }
          } else {
            const currentNodeEdges = R.keys(nodeEdges[edgeProp]) || [];
            const setPropKeys = setEdges[edgeProp];
            const addedEdges = setPropKeys !== undefined
              ? R.without(currentNodeEdges, setPropKeys)
              : R.without(currentNodeEdges, addEdges[edgeProp] || []);
            const deletedEdges = setPropKeys !== undefined
              ? R.without(setPropKeys, currentNodeEdges)
              : R.intersection(currentNodeEdges, deleteEdges[edgeProp] || []);
            const toBeEdges = [
              ...addedEdges,
              ...R.without(deletedEdges, currentNodeEdges)
            ];

            // if (type === 'Assignment' && toEdgeProp === 'tags') {
            //   console.log({toBeEdges});
            // }

            propUpdates = [
              ...R.map(
                edgeId => ({ [`${edgeProp}/${edgeId}`]: true }),
                toBeEdges
              ),
              ...R.map(
                edgeId => ({ [`${edgeProp}/${edgeId}`]: null }),
                deletedEdges
              )
            ];
            if (toOrder === ONE) {
              if (!isCrossUpdate) {
                deleteCrossActions = R.map(
                  edgeId => ({
                    nodeType: type,
                    isCrossUpdate: true,
                    nodeId: edgeId,
                    setEdges: { [toEdgeProp]: null }
                  }),
                  deletedEdges
                );
                addCrossActions = R.map(
                  edgeId => ({
                    nodeType: type,
                    isCrossUpdate: true,
                    nodeId: edgeId,
                    setEdges: { [toEdgeProp]: nodeId }
                  }),
                  addedEdges
                );
              }
            } else {
              if (!isCrossUpdate) {
                deleteCrossActions = R.map(
                  edgeId => ({
                    nodeType: type,
                    isCrossUpdate: true,
                    nodeId: edgeId,
                    // isDeletion: true
                    deleteEdges: { [toEdgeProp]: [nodeId] }
                  }),
                  deletedEdges
                );
                addCrossActions = R.map(
                  edgeId => ({
                    nodeType: type,
                    isCrossUpdate: true,
                    nodeId: edgeId,
                    addEdges: { [toEdgeProp]: [nodeId] }
                  }),
                  addedEdges
                );
              }
              deletedDupPaths = R.map(
                edgeId => `${type}${toEdgeProp}/${edgeId}/${nodeId}`,
                deletedEdges
              );
              toBeDupPaths = R.map(
                edgeId => `${type}${toEdgeProp}/${edgeId}/${nodeId}`,
                toBeEdges
              );
            }
          }
          // console.log(propUpdates, edgeProp);

          allPropUpdates = [...allPropUpdates, ...propUpdates];
          allCrossActions = [
            ...allCrossActions,
            ...deleteCrossActions,
            ...addCrossActions
          ];
          allDeletedDupPaths = [...allDeletedDupPaths, ...deletedDupPaths];
          allToBeDupPaths = [...allToBeDupPaths, ...toBeDupPaths];
        };

        R.mapObjIndexed(edgePropMapper, allEdgePropList);

        const scalarPropUpdates = R.map(
          scalarProp => ({
            [scalarProp]: setScalars[scalarProp]
          }),
          R.keys(setScalars)
        );

        allPropUpdates = [...allPropUpdates, ...scalarPropUpdates];

        // console.log({
        //   nodeScalars,
        //   nodeEdges,
        //   allPropUpdates: R.mergeAll(allPropUpdates)
        // });
        const allPropUpdatesObj = {
          ...nodeScalars,
          ...R.mergeAll(allPropUpdates)
        };

        const setUpdates = R.compose(
          R.mergeAll,
          R.flatten,
          R.map(path => {
            return R.map(
              propUpdate => ({
                [`${path}/${propUpdate}`]: allPropUpdatesObj[propUpdate]
              }),
              R.keys(allPropUpdatesObj)
            );
          })
        )(allToBeDupPaths);

        const deletionUpdates = R.mergeAll(
          R.map(path => ({ [path]: null }), allDeletedDupPaths)
        );

        // delete will overrise set if paths in same batch

        allUpdates = { ...setUpdates, ...deletionUpdates };
      }
      return {
        allUpdates,
        allCrossActions,
        nodeEdges
      };
    };

    ////////////////////////////////////////////////////
    // Promise chain

    const getEdgesScalars = nodeData => {
      const nodeEdges = getEdges(nodeData, nodeType);
      const nodeScalars = getScalars(nodeData, nodeType);
      return Promise.resolve({ nodeEdges, nodeScalars });
    };

    const getGetNodeData = new Promise((resolve, reject) => {
      if (isCreation) {
        return resolve();
      } else {
        return getNodeData(nodeType, nodeId).then(nodeData =>
          resolve(nodeData));
      }
    });

    return getGetNodeData
      .then(getEdgesScalars, passPromiseRejection)
      .then(makeUpdates, passPromiseRejection);
  };

  ////////////////////////////////////////////////////

  // const implUpdate = ({ allUpdates, allCrossActions, nodeEdges }) => {
  //   return executeUpdates(allUpdates)
  //     .then(() => {
  //       return Promise.all(
  //         R.map(crossAction => applyUpdate(crossAction), allCrossActions)
  //       );
  //     })
  //     .then(() => Promise.resolve({ oldNodeEdges: nodeEdges, nodeId }));
  // };

  const mergeActions = actions => {
    const groupedActionsObj = R.groupBy(R.prop("nodeId"), R.flatten(actions));
    const groupedActions = R.values(groupedActionsObj);
    // console.log({ values: groupedActions, keys: R.keys(groupedActionsObj) });
    const mergedActions = R.map(
      group => {
        if (R.length(group) === 1) {
          return group[0];
        } else {
          const nodeType = group[0].nodeType;
          const nodeId = group[0].nodeId;
          const isCreation = group[0].isCreation || false;
          const isDeletion = group[0].isDeletion || false;
          const isCrossUpdate = group[0].isCrossUpdate || false;

          // TODO: check if scalars overlapping
          const setScalars = R.mergeAll(R.pluck("setScalars", group));

          const setEdgesGroup = R.pluck("setEdges", group);
          const addEdgesGroup = R.pluck("addEdges", group);
          const deleteEdgesGroup = R.pluck("deleteEdges", group);

          const setEdgesKeys = R.keys(R.mergeAll(setEdgesGroup));
          const addEdgesKeys = R.keys(R.mergeAll(addEdgesGroup));
          const deleteEdgesKeys = R.keys(R.mergeAll(deleteEdgesGroup));
          // console.log({addEdgesKeys, addEdgesGroup});
          const setEdges = {};
          const addEdges = {};
          const deleteEdges = {};

          R.mapObjIndexed(
            (edgePropInfo, edgeProp) => {
              const hasEdgeProp = R.contains(edgeProp);
              const pluckEdgeProp = R.pluck(edgeProp);

              const hasSet = hasEdgeProp(setEdgesKeys);
              const hasAdd = hasEdgeProp(addEdgesKeys);
              const hasDelete = hasEdgeProp(deleteEdgesKeys);

              if (hasSet && edgePropInfo.order === ONE) {
                const edgeValue = pluckEdgeProp(setEdgesGroup);
                if (R.length(edgeValue) > 1) {
                  // TODO: throw error
                } else if (R.length(edgeValue) === 1) {
                  setEdges[edgeProp] = edgeValue[1];
                }
              } else {
                // if edgeProp is set and delete or set and add throw error
                const hasSetAndAdd = hasSet && hasAdd;
                const hasSetAndDelete = hasSet && hasDelete;
                if (hasSetAndAdd || hasSetAndDelete) {
                  // TODO: throw error
                } else if (hasSet) {
                  const setValues = R.flatten(pluckEdgeProp(setEdgesGroup));
                  if (!R.isEmpty(setValues)) {
                    setEdges[edgeProp] = setValues;
                  }
                } else {
                  // console.log("hey", edgeProp, hasAdd, addEdgesKeys);
                  if (hasAdd) {
                    const addValues = R.flatten(pluckEdgeProp(addEdgesGroup));
                    // console.log({addValues});
                    if (!R.isEmpty(addValues)) {
                      addEdges[edgeProp] = addValues;
                    }
                  }
                  if (hasDelete) {
                    const deleteValues = R.flatten(
                      pluckEdgeProp(deleteEdgesGroup)
                    );
                    if (!R.isEmpty(deleteValues)) {
                      deleteEdges[edgeProp] = deleteValues;
                    }
                  }
                  // TODO: if edgeNode is in added and delete, throw error
                }
              }
            },
            schema[nodeType].edges
          );

          return {
            nodeId,
            nodeType,
            isCreation,
            isDeletion,
            isCrossUpdate,
            setScalars,
            setEdges,
            addEdges,
            deleteEdges
          };
        }
      },
      groupedActions
    );

    // console.log({ actions, mergedActions });
    return mergedActions;
  };

  const mergeUpdates = updates => {
    // TODO: check if overlapping
    return R.mergeAll(updates);
  };

  const executeUpdates = updates => {
    if (R.isEmpty(updates)) {
      return Promise.resolve();
    } else {
      // console.log({ updates });
      return rootRef.update(updates);
    }
  };



  const executeCrossActions = allCrossActions => {
    // console.log({ allCrossActions });
    const actions = mergeActions(allCrossActions);
    // console.log({crossActions: actions});
    return Promise.all(
      R.map(action => getUpdates(action), actions)
    ).then(data => {
      const crossUpdates = R.pluck("allUpdates", data);
      const mergedUpdates = mergeUpdates(crossUpdates);

      return executeUpdates(mergedUpdates);
    });
  };

  const singleUpdate = action => {
    return getUpdates(action).then((
      { allUpdates, allCrossActions, nodeEdges }
    ) => {
      // console.log({ allUpdates, allCrossActions, nodeEdges });
      const nodeId = action.nodeId;
      return executeUpdates(allUpdates)
        .then(() => executeCrossActions(allCrossActions))
        .then(() => {
          return Promise.resolve({ oldNodeEdges: nodeEdges, nodeId });
        });
    });
  };

  const multUpdate = actionArr => {
    // get root updates IN(numOfNodes)
    // merge root updates
    // make root updates OUT(1)
    // get cross actions, check that they don't overlap
    // merge cross actions
    // merge merge cross actions
    // then
    // get cross updates IN(numOfCrossNodes)
    // merge cross updates
    // make cross updates OUT(1)
    const mergedActions = mergeActions(actionArr);
    return Promise.all(
      R.map(action => getUpdates(action), mergedActions)
    ).then(data => {
      const allUpdates = R.pluck("allUpdates", data);
      const mergedUpdates = mergeUpdates(allUpdates);
      return executeUpdates(mergedUpdates)
        .then(() => {
          const allCrossActions = R.pluck("allCrossActions", data);

          return executeCrossActions(allCrossActions);
        })
        .then(() => {
          const nodeEdgesArr = R.pluck("nodeEdges", data);
          const nodeIdsArr = R.pluck("nodeId", mergedActions);
          const nodeTypesArr = R.pluck("nodeType", mergedActions);
          const passedArr = R.times(
            index => ({
              oldNodeEdges: nodeEdgesArr[index],
              nodeId: nodeIdsArr[index],
              nodeType: nodeTypesArr[index]
            }),
            R.length(nodeEdgesArr)
          );
          return Promise.resolve(passedArr);
        });
    });
  };

  const updateNode = props => promiseQueue.add(() => singleUpdate(props));
  const updateNodes = props => promiseQueue.add(() => multUpdate(props));

  ////////////////////////////////////////////////////

  const makeNewNode = props => {
    const newId = rootRef.child(props.nodeType).push().key;
    return {
      ...props,
      setScalars: { id: newId, ...props.setScalars },
      isCreation: true,
      nodeId: newId
    };
  };

  const createNodes = propsArr => {
    return updateNodes(R.map(makeNewNode, propsArr));
  };

  const createNode = props => {
    return updateNode(makeNewNode(props));
  };

  ////////////////////////////////////////////////////

  const chainPromiseMakers = (promiseMakers) => {
    let queue = Promise.resolve()
    promiseMakers.forEach(promiseMaker => {
      queue = queue.then(result => {
        return promiseMaker()
      })
    })
    return queue
  }

  const cascadeDelete = nodeType => (value, edgeProp) => {
    // if (edgeProp === 'grades') console.log("Hey A");
    const edgeInfo = schema[nodeType].edges[edgeProp];
    if (edgeInfo.shouldDelete) {
      if (R.is(String, value)) {
        return deleteNode({ nodeType: edgeInfo.type, nodeId: value });
      } else if (R.is(Object, value) ) {
        const mapOver = Array.isArray(value) ? value : R.keys(value)
        const deleteActions = R.map(
          edgeId => ({ nodeType: edgeInfo.type, nodeId: edgeId }),
          mapOver
        );
        return deleteNodes(deleteActions);
      } else {
        // TODO: throw error
      }
    } else {
      return Promise.resolve();
    }
  };

  const cascadeEdges = (edges, nodeType) => {
    return Promise.all(
      R.values(R.mapObjIndexed(cascadeDelete(nodeType), edges))
    );
  };

  const makeDelete = props => {
    return {
      ...props,
      isDeletion: true
    };
  };

  const mergeEdges = nodeEdgesArr => {
    // merge by nodeType
    const typeGroupedEdges = R.groupBy(R.prop("nodeType"), nodeEdgesArr);
    // console.log({ typeGroupedEdges });
    const result = R.mapObjIndexed(
      typeGroup => {
        const nonUniqResults = R.reduce(
          (acc, data) => {
            const mapOver = data.oldNodeEdges || {};
            return {
              ...acc,
              ...R.mapObjIndexed(
                (value, edgeProp) => {
                  const valueToSpread = R.is(Object, value) ? R.keys(value) : [value];
                  const accValue = acc[edgeProp] || [];
                  return [...accValue, ...valueToSpread];
                },
                mapOver
              )
            };
          },
          {},
          typeGroup
        );
        // uniqify edges
        const uniqResults = R.mapObjIndexed(R.uniq, nonUniqResults);
        // console.log({ nonUniqResults, uniqResults });
        return uniqResults;
      },
      typeGroupedEdges
    );
    // console.log({mergedEdges: result});
    return result
  };

  const deleteNodes = propsArr => {
    // console.log({propsArr});
    return updateNodes(R.map(makeDelete, propsArr)).then(oldNodeEdgesArr => {
      const mergedEdges = mergeEdges(oldNodeEdgesArr);
      // console.log('nnn',{mergedEdges});
      return Promise.all(
        R.values(R.mapObjIndexed(
          (oldNodeEdges, nodeType) => {
            // console.log("lll", {nodeType, oldNodeEdges});
            return cascadeEdges(oldNodeEdges, nodeType);
          },
          mergedEdges
        )
      ));
    });
  };

  const deleteNode = props => {
    const nodeType = props.nodeType;
    return updateNode(makeDelete(props)).then(({ oldNodeEdges }) => {
      return cascadeEdges(oldNodeEdges, nodeType);
    });
  };

  ////////////////////////////////////////////////////

  const mutator = {
    deleteNodes,
    deleteNode,
    createNode,
    createNodes,
    updateNode,
    updateNodes
  };

  const mutatorWithNamedMutations = makeNamedMutations(schema, mutator, log)

  return mutatorWithNamedMutations;
};

export default makeMutator;
