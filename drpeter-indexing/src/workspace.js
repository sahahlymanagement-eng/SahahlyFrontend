const workspace = new URLSearchParams(window.location.search).get('workspace');
export const isClassroom = workspace === 'classroom';
export const apiRoot = `/api/${['classroom', 'mariamgabalawy'].includes(workspace) ? workspace : 'drpeter'}-indexing`;
