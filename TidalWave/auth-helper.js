// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
exports.ensureAuthenticated = function(req, res, next) {
  if (req.isAuthenticated()) { 
    next();
    return;
  }
  res.redirect('/login');
};

exports.queryPermissionWrapper = function(query, user) {
  return query.or(
    [{userPermissions: user.username},
     {groupPermissions: user.groups},
     {derivedUserPermissions: user.username},
     {derivedGroupPermissions: user.groups}
    ]);
  //bypass security
  //return query;
};