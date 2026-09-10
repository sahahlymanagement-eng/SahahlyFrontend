// Application-lifetime jobs: navigation unmounts views, never their uploads.
const jobs = new Map();
const listeners = new Set();
export const getIndexingUpload = key => jobs.get(key) || null;
export function subscribeIndexingUploads(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function startIndexingUpload(key, work) {
  if (jobs.get(key)?.active) return jobs.get(key).promise;
  const update = fields => {
    jobs.set(key, { ...jobs.get(key), ...fields });
    listeners.forEach(listener => listener());
  };
  update({ active: true, message: 'Loading selected students…', error: null });
  const promise = Promise.resolve().then(() => work(message => update({ message })))
    .then(result => { update({ active: false, message: '', result }); return result; })
    .catch(error => { update({ active: false, message: '', error }); return null; });
  jobs.get(key).promise = promise;
  return promise;
}
