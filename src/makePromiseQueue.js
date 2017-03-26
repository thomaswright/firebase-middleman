function noop() {}

const makePromiseQueue = () => {
  let queue = [];
  let pending = false;

  const callPromiseCallback = callback => value => {
    pending = false;
    callback(value);
  };

  const dequeue = () => {
    if (!pending && queue.length !== 0) {
      pending = true;
      const item = queue.shift();
      item
        .promiseGenerator()
        .then(
          callPromiseCallback(item.resolve),
          callPromiseCallback(item.reject),
          callPromiseCallback(item.notify)
        )
        .catch(callPromiseCallback(item.reject)).then(() => dequeue())
    }
  };

  const add = promiseGenerator => {
    return new Promise((resolve, reject, notify) => {
      queue.push({
        promiseGenerator: promiseGenerator,
        resolve: resolve,
        reject: reject,
        notify: notify || noop
      });
      dequeue();
    });
  };

  return {
    add
  };
};

export default makePromiseQueue
/**
// Test

const myQueue = makePromiseQueue();

function executeAction(call) {
	console.log('starting', call)
  return new Promise((resolve, reject) => {
    window.setTimeout(
      () => {
        console.log('finished', call);
        resolve();
      },
      2000
    );
  });
}

myQueue.add(() => executeAction("Hey"));
myQueue.add(() => executeAction("How"));
myQueue.add(() => executeAction("Are"));
myQueue.add(() => executeAction("You"));
myQueue.add(() => executeAction("Dude"));

*/
