var express = require('express');
var router = express.Router();

var Hierarchy = require('../hierarchy');

router.get('/', function(req, res) {
  res.render('page', {
    pageDetails:null,
    editMode:false,
    pageHierarchy:Hierarchy.pageHierarchy,
    navbarData:{
      projectName:"Tidal Wave",
      userName:"Jason Gauci",
      onPage:false,
      editMode:false
    }
  });
});

module.exports = router;
