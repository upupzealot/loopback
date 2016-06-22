// Copyright IBM Corp. 2013,2016. All Rights Reserved.
// Node module: loopback
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var assert = require('assert');
var sinon = require('sinon');
var loopback = require('../index');
var Role = loopback.Role;
var RoleMapping = loopback.RoleMapping;
var User = loopback.User;
var Application = loopback.Application;
var ACL = loopback.ACL;
var async = require('async');
var expect = require('chai').expect;
var Promise = require('bluebird');

function checkResult(err, result) {
  assert(!err);
}

describe('role model', function() {
  var ds;

  beforeEach(function() {
    ds = loopback.createDataSource({ connector: 'memory' });
    // Re-attach the models so that they can have isolated store to avoid
    // pollutions from other tests
    ACL.attachTo(ds);
    User.attachTo(ds);
    Role.attachTo(ds);
    RoleMapping.attachTo(ds);
    Application.attachTo(ds);
    ACL.roleModel = Role;
    ACL.roleMappingModel = RoleMapping;
    ACL.userModel = User;
    ACL.applicationModel = Application;
    Role.roleMappingModel = RoleMapping;
    Role.userModel = User;
    Role.applicationModel = Application;
  });

  it('should define role/role relations', function() {
    Role.create({ name: 'user' }, function(err, userRole) {
      Role.create({ name: 'admin' }, function(err, adminRole) {
        userRole.principals.create({ principalType: RoleMapping.ROLE, principalId: adminRole.id },
        function(err, mapping) {
          Role.find(function(err, roles) {
            assert.equal(roles.length, 2);
          });
          RoleMapping.find(function(err, mappings) {
            assert.equal(mappings.length, 1);
            assert.equal(mappings[0].principalType, RoleMapping.ROLE);
            assert.equal(mappings[0].principalId, adminRole.id);
          });
          userRole.principals(function(err, principals) {
            assert.equal(principals.length, 1);
          });
          userRole.roles(function(err, roles) {
            assert.equal(roles.length, 1);
          });
        });
      });
    });
  });

  it('should define role/user relations', function() {
    User.create({ name: 'Raymond', email: 'x@y.com', password: 'foobar' }, function(err, user) {
      Role.create({ name: 'userRole' }, function(err, role) {
        role.principals.create({ principalType: RoleMapping.USER, principalId: user.id },
        function(err, p) {
          Role.find(function(err, roles) {
            assert(!err);
            assert.equal(roles.length, 1);
            assert.equal(roles[0].name, 'userRole');
          });
          role.principals(function(err, principals) {
            assert(!err);
            assert.equal(principals.length, 1);
            assert.equal(principals[0].principalType, RoleMapping.USER);
            assert.equal(principals[0].principalId, user.id);
          });
          role.users(function(err, users) {
            assert(!err);
            assert.equal(users.length, 1);
            assert.equal(users[0].id, user.id);
          });
        });
      });
    });
  });

  it('should not allow duplicate role name', function(done) {
    Role.create({ name: 'userRole' }, function(err, role) {
      if (err) return done(err);

      Role.create({ name: 'userRole' }, function(err, role) {
        expect(err).to.exist;
        expect(err).to.have.property('name', 'ValidationError');
        expect(err).to.have.deep.property('details.codes.name');
        expect(err.details.codes.name).to.contain('uniqueness');
        expect(err).to.have.property('statusCode', 422);

        done();
      });
    });
  });

  it('should automatically generate role id', function() {
    User.create({ name: 'Raymond', email: 'x@y.com', password: 'foobar' }, function(err, user) {
      Role.create({ name: 'userRole' }, function(err, role) {
        assert(role.id);
        role.principals.create({ principalType: RoleMapping.USER, principalId: user.id },
        function(err, p) {
          assert(p.id);
          assert.equal(p.roleId, role.id);
          Role.find(function(err, roles) {
            assert(!err);
            assert.equal(roles.length, 1);
            assert.equal(roles[0].name, 'userRole');
          });
          role.principals(function(err, principals) {
            assert(!err);
            assert.equal(principals.length, 1);
            assert.equal(principals[0].principalType, RoleMapping.USER);
            assert.equal(principals[0].principalId, user.id);
          });
          role.users(function(err, users) {
            assert(!err);
            assert.equal(users.length, 1);
            assert.equal(users[0].id, user.id);
          });
        });
      });
    });
  });

  it('should support getRoles() and isInRole()', function() {
    User.create({ name: 'Raymond', email: 'x@y.com', password: 'foobar' }, function(err, user) {
      Role.create({ name: 'userRole' }, function(err, role) {
        role.principals.create({ principalType: RoleMapping.USER, principalId: user.id },
        function(err, p) {
          Role.isInRole('userRole', { principalType: RoleMapping.USER, principalId: user.id },
          function(err, exists) {
            assert(!err && exists === true);
          });

          Role.isInRole('userRole', { principalType: RoleMapping.APP, principalId: user.id },
          function(err, exists) {
            assert(!err && exists === false);
          });

          Role.isInRole('userRole', { principalType: RoleMapping.USER, principalId: 100 },
          function(err, exists) {
            assert(!err && exists === false);
          });

          Role.getRoles({ principalType: RoleMapping.USER, principalId: user.id },
          function(err, roles) {
            assert.equal(roles.length, 3); // everyone, authenticated, userRole
            assert(roles.indexOf(role.id) >= 0);
            assert(roles.indexOf(Role.EVERYONE) >= 0);
            assert(roles.indexOf(Role.AUTHENTICATED) >= 0);
          });
          Role.getRoles({ principalType: RoleMapping.APP, principalId: user.id },
          function(err, roles) {
            assert.equal(roles.length, 2);
            assert(roles.indexOf(Role.EVERYONE) >= 0);
            assert(roles.indexOf(Role.AUTHENTICATED) >= 0);
          });
          Role.getRoles({ principalType: RoleMapping.USER, principalId: 100 },
          function(err, roles) {
            assert.equal(roles.length, 2);
            assert(roles.indexOf(Role.EVERYONE) >= 0);
            assert(roles.indexOf(Role.AUTHENTICATED) >= 0);
          });
          Role.getRoles({ principalType: RoleMapping.USER, principalId: null },
          function(err, roles) {
            assert.equal(roles.length, 2);
            assert(roles.indexOf(Role.EVERYONE) >= 0);
            assert(roles.indexOf(Role.UNAUTHENTICATED) >= 0);
          });
        });
      });
    });
  });

  it('should support owner role resolver', function() {
    Role.registerResolver('returnPromise', function(role, context) {
      return new Promise(function(resolve) {
        process.nextTick(function() {
          resolve(true);
        });
      });
    });

    var Album = ds.createModel('Album', {
      name: String,
      userId: Number,
      customerId: Number,
    }, {
      relations: {
        user: {
          type: 'belongsTo',
          model: 'User',
          foreignKey: 'userId',
        },
      },
      relations: {
        customer: {
          type: 'belongsTo',
          model: 'User',
          foreignKey: 'customerId',
        },
      },
    });

    User.create({ name: 'Raymond', email: 'x@y.com', password: 'foobar' }, function(err, user) {
      User.create({ name: 'Eric', email: 'z@y.com', password: 'foobar' }, function(err, user2) {
        Role.isInRole('returnPromise', { principalType: ACL.USER, principalId: user.id },
        function(err, yes) {
          assert(!err && yes);
        });

        Role.isInRole(Role.AUTHENTICATED, { principalType: ACL.USER, principalId: user.id },
        function(err, yes) {
          assert(!err && yes);
        });

        Role.isInRole(Role.AUTHENTICATED, { principalType: ACL.USER, principalId: null },
        function(err, yes) {
          assert(!err && !yes);
        });

        Role.isInRole(Role.UNAUTHENTICATED, { principalType: ACL.USER, principalId: user.id },
        function(err, yes) {
          assert(!err && !yes);
        });
        Role.isInRole(Role.UNAUTHENTICATED, { principalType: ACL.USER, principalId: null },
        function(err, yes) {
          assert(!err && yes);
        });

        Role.isInRole(Role.EVERYONE, { principalType: ACL.USER, principalId: user.id },
        function(err, yes) {
          assert(!err && yes);
        });

        Role.isInRole(Role.EVERYONE, { principalType: ACL.USER, principalId: null },
        function(err, yes) {
          assert(!err && yes);
        });

        Album.create({ name: 'Album 1', userId: user.id, customerId: user2.id }, function(err, album1) {
          var role = { principalType: ACL.USER, principalId: user.id, model: Album, id: album1.id };
          Role.isInRole(Role.OWNER, role, function(err, yes) {
            assert(!err && yes);
          });
          role = { principalType: ACL.USER, principalId: user2.id, model: Album, id: album1.id };
          Role.isInRole(Role.OWNER, role, function(err, yes) {
            assert(!err && yes);
          });
          Album.create({ name: 'Album 2' }, function(err, album2) {
            role = { principalType: ACL.USER, principalId: user.id, model: Album, id: album2.id };
            Role.isInRole(Role.OWNER, role, function(err, yes) {
              assert(!err && !yes);
            });
          });
        });
      });
    });
  });

  describe('isMappedToRole', function() {
    var user, app, role;

    beforeEach(function(done) {
      User.create({
        username: 'john',
        email: 'john@gmail.com',
        password: 'jpass',
      }, function(err, u) {
        if (err) return done(err);

        user = u;
        User.create({
          username: 'mary',
          email: 'mary@gmail.com',
          password: 'mpass',
        }, function(err, u) {
          if (err) return done(err);

          Application.create({
            name: 'demo',
          }, function(err, a) {
            if (err) return done(err);

            app = a;
            Role.create({
              name: 'admin',
            }, function(err, r) {
              if (err) return done(err);

              role = r;
              var principals = [
                {
                  principalType: ACL.USER,
                  principalId: user.id,
                },
                {
                  principalType: ACL.APP,
                  principalId: app.id,
                },
              ];
              async.each(principals, function(p, done) {
                role.principals.create(p, done);
              }, done);
            });
          });
        });
      });
    });

    it('should resolve user by id', function(done) {
      ACL.resolvePrincipal(ACL.USER, user.id, function(err, u) {
        if (err) return done(err);

        expect(u.id).to.eql(user.id);

        done();
      });
    });

    it('should resolve user by username', function(done) {
      ACL.resolvePrincipal(ACL.USER, user.username, function(err, u) {
        if (err) return done(err);

        expect(u.username).to.eql(user.username);

        done();
      });
    });

    it('should resolve user by email', function(done) {
      ACL.resolvePrincipal(ACL.USER, user.email, function(err, u) {
        if (err) return done(err);

        expect(u.email).to.eql(user.email);

        done();
      });
    });

    it('should resolve app by id', function(done) {
      ACL.resolvePrincipal(ACL.APP, app.id, function(err, a) {
        if (err) return done(err);

        expect(a.id).to.eql(app.id);

        done();
      });
    });

    it('should resolve app by name', function(done) {
      ACL.resolvePrincipal(ACL.APP, app.name, function(err, a) {
        if (err) return done(err);

        expect(a.name).to.eql(app.name);

        done();
      });
    });

    it('should report isMappedToRole by user.username', function(done) {
      ACL.isMappedToRole(ACL.USER, user.username, 'admin', function(err, flag) {
        if (err) return done(err);

        expect(flag).to.eql(true);

        done();
      });
    });

    it('should report isMappedToRole by user.email', function(done) {
      ACL.isMappedToRole(ACL.USER, user.email, 'admin', function(err, flag) {
        if (err) return done(err);

        expect(flag).to.eql(true);

        done();
      });
    });

    it('should report isMappedToRole by user.username for mismatch',
      function(done) {
        ACL.isMappedToRole(ACL.USER, 'mary', 'admin', function(err, flag) {
          if (err) return done(err);

          expect(flag).to.eql(false);

          done();
        });
      });

    it('should report isMappedToRole by app.name', function(done) {
      ACL.isMappedToRole(ACL.APP, app.name, 'admin', function(err, flag) {
        if (err) return done(err);

        expect(flag).to.eql(true);

        done();
      });
    });

    it('should report isMappedToRole by app.name', function(done) {
      ACL.isMappedToRole(ACL.APP, app.name, 'admin', function(err, flag) {
        if (err) return done(err);

        expect(flag).to.eql(true);

        done();
      });
    });
  });

  describe('listByPrincipalType', function() {
    var sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
      sandbox.restore();
    });

    it('should fetch all models assigned to the role', function(done) {
      var principalTypesToModels = {};
      var runs = 0;
      var mappings;

      principalTypesToModels[RoleMapping.USER] = User;
      principalTypesToModels[RoleMapping.APPLICATION] = Application;
      principalTypesToModels[RoleMapping.ROLE] = Role;

      mappings = Object.keys(principalTypesToModels);

      mappings.forEach(function(principalType) {
        var Model = principalTypesToModels[principalType];
        Model.create({ name: 'test', email: 'x@y.com', password: 'foobar' }, function(err, model) {
          Role.create({ name: 'testRole' }, function(err, role) {
            role.principals.create({ principalType: principalType, principalId: model.id },
            function(err, p) {
              var pluralName = Model.pluralModelName.toLowerCase();
              role[pluralName](function(err, models) {
                assert(!err);
                assert.equal(models.length, 1);

                if (++runs === mappings.length) {
                  done();
                }
              });
            });
          });
        });
      });
    });

    it('should apply query', function(done) {
      User.create({ name: 'Raymond', email: 'x@y.com', password: 'foobar' }, function(err, user) {
        Role.create({ name: 'userRole' }, function(err, role) {
          role.principals.create({ principalType: RoleMapping.USER, principalId: user.id },
          function(err, p) {
            var query = { fields: ['id', 'name'] };
            sandbox.spy(User, 'find');
            role.users(query, function(err, users) {
              assert(!err);
              assert.equal(users.length, 1);
              assert.equal(users[0].id, user.id);
              assert(User.find.calledWith(query));

              done();
            });
          });
        });
      });
    });
  });

  describe('isOwner', function() {
    it('supports app-local model registry', function(done) {
      var app = loopback({ localRegistry: true, loadBuiltinModels: true });
      app.dataSource('db', { connector: 'memory' });
      // attach all auth-related models to 'db' datasource
      app.enableAuth({ dataSource: 'db' });

      var Role = app.models.Role;
      var User = app.models.User;

      var u = app.registry.findModel('User');
      var credentials = { email: 'test@example.com', password: 'pass' };
      User.create(credentials, function(err, user) {
        if (err) return done(err);

        Role.isOwner(User, user.id, user.id, function(err, result) {
          if (err) return done(err);

          expect(result, 'isOwner result').to.equal(true);

          done();
        });
      });
    });
  });
});
