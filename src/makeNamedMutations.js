import R from "ramda";

const capitalizeFirstLetter = R.compose(
  R.join(""),
  R.over(R.lensIndex(0), R.toUpper)
);

const addToBank = R.curry((mutator, nodeType, mutationType, bank) => {
  const nodeTypeString = capitalizeFirstLetter(nodeType);
  const newSingleMutation = {
    [`${mutationType}${nodeTypeString}`]: props =>
      mutator[`${mutationType}Node`]({ nodeType, ...props })
  };
  const newMultMutation = {
    [`${mutationType}${nodeTypeString}s`]: propsArr =>
      mutator[`${mutationType}Nodes`](R.map(props => ({ nodeType, ...props }), propsArr))
  };
  return [...bank, newSingleMutation, newMultMutation];
});

const makeNamedMutations = (schema, mutator, log) => {
  const mapNodeTypes = (mutationBank, nodeType) =>
    R.compose(
      addToBank(mutator, nodeType)("create"),
      addToBank(mutator, nodeType)("update"),
      addToBank(mutator, nodeType)("delete")
    )(mutationBank);

  const mutationBankLessPrimaries = R.mergeAll(
    R.reduce(mapNodeTypes, [], R.keys(schema))
  );

  const mutationBank = {...mutationBankLessPrimaries, ...mutator}

  const makeLoggerAndCaller = (action, actionName) => args => {
    // mutationLog.push({action: k, arguments: args})
    // console.log(mutationLog);
    console.log(actionName, args);
    return action(args);
  };

  if (log) {
    return R.mapObjIndexed(makeLoggerAndCaller, mutationBank);
  } else {
    return mutationBank;
  }
};

export default makeNamedMutations;
