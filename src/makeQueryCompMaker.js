import R from "ramda";
import React, { Component, PropTypes } from "react";
import { convertShorthandSchema } from './schemaHelpers'

const ONE = "ONE";
const MANY = "MANY";

const flattenObj = obj => {
  const go = obj_ => R.chain(
    ([k, v]) => {
      if (typeof v === "object") {
        return R.map(([k_, v_]) => [`${k}.${k_}`, v_], go(v));
      } else {
        return [[k, v]];
      }
    },
    R.toPairs(obj_)
  );

  return R.fromPairs(go(obj));
};


/**___________________________________________________________________________*/
const dataInjector = (schema_, rootRef) => (
  { ComposedComponent, queryOnType, query: rootQuery }
) => {
  const schema = convertShorthandSchema(schema_)
  return class extends Component {
    static props = { queryOnNode: PropTypes.string.isRequired };

    constructor(props) {
      super(props);
      this.results = {};
      this.binderCallbacks = {};
      this.pathValues = {};
    }

    componentDidMount() {
      this.bindOnNode(this.props.queryOnNode);
    }

    componentWillReceiveProps(newProps) {
      if (newProps.queryOnNode !== this.props.queryOnNode) {
        this.unbinderMapper({ path: [] });
        this.bindOnNode(newProps.queryOnNode);
      }
    }

    componentWillUnmount() {
      this.unbinderMapper({ path: [] });
    }

    bindOnNode = queryOnNode => {
      this.bindNode({
        path: [],
        type: queryOnType,
        nodeId: queryOnNode,
        query: rootQuery
      });
    };

    bindNode = ({ type, nodeId, query, path }) => {
      const rootPath = `${type}/${nodeId}`;
      // console.log({rootPath});
      const binderReference = rootRef.child(rootPath).on("value", snapshot => {
        const nodeValue = snapshot.val();
        this.route({
          query,
          nodeValue,
          path,
          type,
          nodeId
        });
        this.forceUpdate()
      });
      this.setBinderCallback({ apiPath: rootPath, binderReference, path });
    };

    route = ({ query, nodeValue, path, type, nodeId }) => {
      // console.log(Date.now());
      // console.log({ query, nodeValue, path, type, nodeId, currentResults: this.results, pathValues: this.pathValues});
      R.mapObjIndexed(
        (qValue, qProp) => {
          const currentValue = this.getPathValue({
            path: R.append(qProp, path)
          });
          // console.log({currentValue, nodeId: nodeValue[qProp], qProp});
          if (!R.equals(currentValue, nodeValue[qProp])) {
            // console.log('Hello');
            this.setPathValue({
              value: nodeValue[qProp],
              path: R.append(qProp, path)
            });
            if (schema[type].scalars[qProp] !== undefined) {
              // console.log('TYPE A');
              // const before = Date.now()

              this.setResults({
                path: R.append(qProp, path),
                value: nodeValue[qProp]
              });
              // console.log(Date.now() - before);

            } else if (schema[type].edges[qProp] !== undefined) {
              if (R.is(Object, qValue)) {
                if (schema[type].edges[qProp].order === ONE) {
                  // console.log('TYPE B');
                  this.bindNode({
                    type: schema[type].edges[qProp].type,
                    nodeId: nodeValue[qProp],
                    query: qValue,
                    path: R.append(qProp, path)
                  });
                } else {
                  // console.log('TYPE C');
                  this.bindMany({
                    type: type,
                    nodeId: nodeId,
                    qProp: qProp,
                    qValue: qValue,
                    path: R.append(qProp, path)
                  });
                }
              } else {
                // console.log(qProp, nodeValue[qProp], path);
                // console.log('TYPE D');
                this.setResults({
                  path: R.append(qProp, path),
                  value: nodeValue[qProp]
                });
              }
            } else {
              // console.log("query error");
              //TODO: query error
            }
          }
        },
        query
      );
    };

    bindMany = ({ type, nodeId, qProp, qValue, path }) => {
      const propType = schema[type].edges[qProp].type;
      const dupPath = `${type}${qProp}/${nodeId}`;
      // console.log({dupPath});
      const dupBindRef = rootRef.child(dupPath).on("value", snapshot => {
        const dupValue = snapshot.val() || {};
        const oldValue = this.getResults({ path }) || {};

        const changedKeys = R.filter(
          key => !R.equals(dupValue[key], oldValue[key]),
          R.keys(dupValue)
        );
        const deletedKeys = R.difference(R.keys(oldValue), changedKeys);
        // console.log({changedKeys, deletedKeys});
        // console.log({type, qProp, dupValue, changedKeys});

        if (!R.isEmpty(deletedKeys)) {
          R.forEach(k => {
            this.unbinderMapper({ path: R.append(k, path) });
          }, deletedKeys)
        }
        if (!R.isEmpty(changedKeys)) {
          R.forEach(
            k => {
              this.route({
                query: qValue,
                nodeValue: dupValue[k],
                path: R.append(k, path),
                type: propType,
                nodeId: k
              });
            },
            changedKeys
          )
          this.forceUpdate()
        }
      });

      this.setBinderCallback({
        apiPath: dupPath,
        binderReference: dupBindRef,
        path
      });
    };

    getResults = ({ path }) => {
      return R.path(path, this.results);
    };

    setResults = ({ path, value }) => {
      // console.log("SET RESULT", path, value, this.getResults({path}));
      this.results = R.assocPath(path, value, this.results);
    };

    clearResults = ({ path }) => {
      //console.log("BEFORE", this.results);
      this.results = R.dissocPath(path, this.results);
      //console.log("AFTER", this.results);
      this.forceUpdate();
    };

    unbinderMapper = ({ path }) => {
      this.clearPathValues({ path });
      const binderCallbacks = flattenObj(this.getBinderCallbacks({ path }));
      R.map(v => v(), binderCallbacks);
      this.clearBinderCallbacks({ path });
      this.clearResults({ path });
    };

    getPathValue = ({ path }) => {
      return R.path(R.append("PATH_VALUE_REFERENCE", path), this.pathValues);
    };

    setPathValue = ({ path, value }) => {
      this.pathValues = R.assocPath(
        R.append("PATH_VALUE_REFERENCE", path),
        value,
        this.pathValues
      );
    };

    clearPathValues = ({ path }) => {
      this.pathValues = R.dissocPath(path, this.pathValues);
    };

    getBinderCallbacks = ({ path }) => {
      return R.path(path, this.binderCallbacks);
    };

    setBinderCallback = ({ apiPath, binderReference, path }) => {
      const currentBinderCallback = R.pathOr(
        () => "nullpath",
        R.append("BINDER_REFERENCE", path),
        this.binderCallbacks
      );

      // if currentBinderCallback exists and is different than the new path
      // then unbind all the subscriptions on that branch
      if (
        apiPath !== currentBinderCallback(true) &&
          currentBinderCallback(true) !== "nullpath"
      ) {
        const binderCallbacks = flattenObj(this.getBinderCallbacks({ path }));
        // console.log({binderCallbacks});
        R.map(v => v(), binderCallbacks);
      }

      const binderCallback = returnApiPath => {
        if (returnApiPath) {
          // path stored here for easy access in the check above
          return apiPath;
        } else {
          return rootRef.child(apiPath).off("value", binderReference);
        }
      };

      this.binderCallbacks = R.assocPath(
        R.append("BINDER_REFERENCE", path),
        binderCallback,
        this.binderCallbacks
      );
      this.forceUpdate();
    };

    clearBinderCallbacks = ({ path }) => {
      this.binderCallbacks = R.dissocPath(path, this.binderCallbacks);
      this.forceUpdate();
    };

    objectArrayer = (obj, nodeType, path) => {
      return R.mapObjIndexed(
        (value, key, o) => {
          const orderIsMany = R.path([nodeType, "edges", key, "order"], schema) === MANY
          const hasSubQuery = R.is(Object, R.path([...path, key], rootQuery))
          const isAnEdge = R.path([nodeType, "edges", key], schema)
          if (orderIsMany && hasSubQuery) {
            return R.values(value).map(v =>
              this.objectArrayer(
                v,
                schema[nodeType].edges[key].type,
                R.append(key, path)
              ));
          } else if (isAnEdge && hasSubQuery) {
            return this.objectArrayer(
              value,
              schema[nodeType].edges[key].type,
              R.append(key, path)
            );
          } else {
            return value;
          }
        },
        obj
      );
    };

    render() {
      // console.log({results: this.results});
      const passedProps = R.omit(["schema", "queryOnNode"], this.props);

      const arrayedData = this.objectArrayer(this.results, queryOnType, []);

      const data = { [queryOnType]: arrayedData };

      return <ComposedComponent {...passedProps} {...data} />;
    }
  };
}

/**___________________________________________________________________________*/
export default dataInjector;
