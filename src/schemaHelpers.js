import R from "ramda";

const arr1arr2ToObjEnums = (a1, a2) => {
  return R.compose(obj => Object.freeze(obj), R.fromPairs, R.transpose)([a1, a2]);
};

const arrToObjEnums = array => arr1arr2ToObjEnums(array, array);

const expandSchema = unexpandedSchema => {
  return R.mapObjIndexed(
    (props, nodeType) => {
      return R.mapObjIndexed(
        (propValue, propName) => {
          if (Array.isArray(propValue)) {
            const crossProp = unexpandedSchema[propValue[0]][propValue[3]]
            return {
              edgeProp: propName,
              type: propValue[0],
              order: propValue[1],
              shouldDelete: propValue[2],
              toType: nodeType,
              toEdgeProp: propValue[3],
              toOrder: crossProp[1],
              toShouldDelete: crossProp[2]
            }
          } else {
            return propValue
          }
        }
        ,props
      )
    }
    ,unexpandedSchema
  )
}

const sortSchema = unsortenedSchema => {
  return R.mapObjIndexed(
    (props, nodeType) => {
      return {
        scalars: R.pickBy((x) => !R.is(Object, x), props),
        edges: R.pickBy(R.is(Object), props)
      }
    }
    , unsortenedSchema
  )
}

const convertShorthandSchema = x => sortSchema(expandSchema(x))

export {
  convertShorthandSchema,
  arrToObjEnums
}
