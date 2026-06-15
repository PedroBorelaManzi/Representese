const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /function LandingOrRedirect\(\) \{\s*const \{ user, loading \} = useAuth\(\);\s*if \(loading\) \{\s*return <LoadingSpinner \/>;\s*\}/,
  `function LandingOrRedirect() {\n  const { user, loading } = useAuth();\n  const hasLoggedInOnce = localStorage.getItem("rm_has_logged_in_once") === "true";\n\n  if (loading && hasLoggedInOnce) {\n    return <LoadingSpinner />;\n  }\n  if (loading && !hasLoggedInOnce) {\n    return <Landing />;\n  }`
);

content = content.replace(/const hasLoggedInOnce = localStorage\.getItem\("rm_has_logged_in_once"\) === "true";/g, (match, offset, str) => {
  // Only keep the first one
  return offset === str.indexOf(match) ? match : "";
});


fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('Fixed Landing page blocking v2');
