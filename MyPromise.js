const STATE = require("./PromiseState");
const UncaughtPromiseError = require("./UncaughtPromiseError");

class MyPromise {
  #thenCallbacks = [];
  #catchCallbacks = [];
  #state = STATE.PENDING;
  #value;
  #onSuccesBind = this.#onSuccess.bind(this);
  #onFailBind = this.#onFail.bind(this);

  constructor(callback) {
    try {
      callback(this.#onSuccesBind, this.#onFailBind);
    } catch (error) {
      this.#onFailBind(error);
    }
  }

  #runCallbacks() {
    if (this.#state === STATE.FULFILLED) {
      this.#thenCallbacks.forEach((callback) => {
        callback(this.#value);
      });

      this.#thenCallbacks = [];
    }

    if (this.#state === STATE.REJECTED) {
      this.#catchCallbacks.forEach((callback) => {
        callback(this.#value);
      });

      this.#catchCallbacks = [];
    }
  }

  #onSuccess(value) {
    queueMicrotask(() => {
      if (this.#state !== STATE.PENDING) return;

      if (value && typeof value.then === "function") {
        value.then(this.#onSuccesBind, this.#onFailBind);
        return;
      }

      this.#value = value;
      this.#state = STATE.FULFILLED;
      this.#runCallbacks();
    });
  }

  #onFail(value) {
    queueMicrotask(() => {
      if (this.#state !== STATE.PENDING) return;

      if (value && typeof value.then === "function") {
        value.then(this.#onSuccesBind, this.#onFailBind);
        return;
      }

      if (this.#catchCallbacks.length === 0) {
        throw new UncaughtPromiseError(value);
      }

      this.#value = value;
      this.#state = STATE.REJECTED;
      this.#runCallbacks();
    });
  }

  then(thenCallback, catchCallback) {
    return new MyPromise((resolve, reject) => {
      this.#thenCallbacks.push((result) => {
        if (thenCallback == null) {
          resolve(result);
          return;
        }

        try {
          resolve(thenCallback(result));
        } catch (error) {
          reject(error);
        }
      });

      this.#catchCallbacks.push((result) => {
        if (catchCallback == null) {
          reject(result);
          return;
        }

        try {
          resolve(catchCallback(result));
        } catch (error) {
          reject(error);
        }
      });

      this.#runCallbacks();
    });
  }

  catch(callback) {
    return this.then(undefined, callback);
  }

  finally(callback) {
    return this.then(
      (result) => {
        callback();
        return result;
      },
      (result) => {
        callback();
        throw result;
      }
    );
  }

  static resolve(value) {
    return new MyPromise((resolve) => {
      resolve(value);
    });
  }

  static reject(value) {
    return new MyPromise((_resolve, reject) => {
      reject(value);
    });
  }

  static all(promises) {
    const results = [];
    let completedPromises = 0;
    return new MyPromise((resolve, reject) => {
      for (let i = 0; i < promises.length; i++) {
        const promise = promises[i];
        promise
          .then((value) => {
            completedPromises++;
            results[i] = value;
            if (completedPromises === promises.length) {
              resolve(results);
            }
          })
          .catch(reject);
      }
    });
  }

  static allSettled(promises) {
    const results = [];
    let completedPromises = 0;
    return new MyPromise((resolve) => {
      for (let i = 0; i < promises.length; i++) {
        const promise = promises[i];
        promise
          .then((value) => {
            results[i] = {
              status: STATE.FULFILLED,
              value,
            };
          })
          .catch((reason) => {
            results[i] = {
              status: STATE.REJECTED,
              reason,
            };
          })
          .finally(() => {
            completedPromises++;
            if (completedPromises === promises.length) {
              resolve(results);
            }
          });
      }
    });
  }

  static race(promises) {
    return new MyPromise((resolve, reject) => {
      promises.forEach((promise) => {
        promise.then(resolve).catch(reject);
      });
    });
  }
}

module.exports = MyPromise;
