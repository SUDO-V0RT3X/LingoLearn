#!/usr/bin/env bash
# Runs one person's tests, frontend and backend, from anywhere in the group-10 repo.
#
#   ./runTests.sh -TD                 my tests, frontend then backend
#   ./runTests.sh -MO -TS          several people, one after the other
#   ./runTests.sh -TC -fe          frontend only (-be for backend only)
#   ./runTests.sh -TK -v             list every test by name
#   ./runTests.sh -all                   everyone's scoped tests
#   ./runTests.sh -list                  show whose files are in which scope
#
# Names are not case sensitive. Put this file in the repo root, next to frontend/
# and backend/, then run `chmod +x runTests.sh` once. On Windows, run it in Git Bash.
#
# Backend integration tests need the database running (Docker), and they use the
# DATABASE_URL in backend/.env, so they run against whatever database that names.

set -u

PEOPLE="TD MO TS TK TC NS"

# Each scope is a list of path fragments. Vitest runs only the test files whose
# path contains one of them, so a folder picks up every test inside it.
frontend_scope() {
    case "$1" in
        td)    echo "src/features/content_builder/ src/features/shared/presentation/blocks/ src/features/shared/models/" ;;
        mo)    echo "src/features/media_feature/ src/core/endpoints/feature_endpoints/__tests__/taxonomyEndpoints src/features/shared/presentation/forms/" ;;
        ts)    echo "src/features/auth_feature/ src/features/admin_users_feature/ src/core/endpoints/models/__tests__/EndpointType" ;;
        tk)   echo "src/features/onboarding_feature/" ;;
        tc) echo "src/features/review_queue_feature/ src/features/review_detail_feature/ src/features/progress_feature/" ;;
        ns)    echo "src/features/learner_experience/" ;;
    esac
}

backend_scope() {
    case "$1" in
        td)    echo "test/unit/contentValidation test/unit/contentKind test/unit/withholdAnswers test/unit/learnerAccess test/unit/grading test/integration/contentRoutes" ;;
        mo)    echo "test/unit/mediaValidation test/unit/imageValidation test/unit/taxonomyValidation test/unit/seedDataValidation test/integration/mediaRoutes test/integration/taxonomyRoutes test/integration/seedDemo test/unit/sqlSafety test/integration/sqlInjection test/integration/securityHardening" ;;
        ts)    echo "test/unit/parentLinkMethods test/unit/childProgressFlagRules test/unit/roleGuard test/unit/rateLimit test/unit/genericRouteCatch test/integration/authRoutes test/integration/authRateLimit test/integration/adminAccountManagement test/integration/adminUserRoutes test/integration/childProgressReportRoutes" ;;
        tk)   echo "test/unit/onboardingRoutes test/unit/onboarding_setup test/unit/placementMethods test/unit/placementRoutes test/unit/dateOfBirthRules test/integration/onboardingRoutes test/integration/placementRoutes test/integration/dateOfBirthRoutes" ;;
        tc) echo "test/unit/challengeEligibility test/unit/progressMethods test/unit/questionSelector test/integration/moderationRoutes test/integration/progressRoutes" ;;
        ns)    echo "test/unit/learnerGate test/integration/testAttemptsRoutes test/integration/readingRoutes" ;;
    esac
}

usage() {
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
    echo "People: $PEOPLE"
}

# Accepts -TD, --td or td, and the long form of NS's name.
normalise() {
    local name
    name=$(echo "$1" | sed 's/^-*//' | tr '[:upper:]' '[:lower:]')
    case "$name" in
        ns) name=ns ;;
    esac
    echo "$name"
}

# Finds the repo whether the script sits in it or is run from inside it.
find_repo() {
    local here
    here=$(cd "$(dirname "$0")" && pwd)
    if [ -d "$here/frontend" ] && [ -d "$here/backend" ]; then echo "$here"; return; fi
    here=$(git rev-parse --show-toplevel 2>/dev/null)
    if [ -n "$here" ] && [ -d "$here/frontend" ] && [ -d "$here/backend" ]; then echo "$here"; return; fi
}

sides="frontend backend"
verbose=""
chosen=""

[ $# -eq 0 ] && { usage; exit 0; }

for arg in "$@"; do
    case "$(normalise "$arg")" in
        h|help)   usage; exit 0 ;;
        fe)       sides="frontend" ;;
        be)       sides="backend" ;;
        v|verbose) verbose="--reporter=verbose" ;;
        all)      chosen="$chosen $(echo "$PEOPLE" | tr '[:upper:]' '[:lower:]')" ;;
        list)     chosen="LIST" ;;
        *)
            person=$(normalise "$arg")
            if [ -z "$(frontend_scope "$person")$(backend_scope "$person")" ] && [ "$person" != ns ]; then
                echo "Unknown option or name: $arg"
                echo "People: $PEOPLE"
                exit 2
            fi
            chosen="$chosen $person"
            ;;
    esac
done

if [ "$chosen" = "LIST" ]; then
    for person in $(echo "$PEOPLE" | tr '[:upper:]' '[:lower:]'); do
        echo "$person"
        echo "  frontend: $(frontend_scope "$person")"
        echo "  backend:  $(backend_scope "$person")"
    done
    exit 0
fi

repo=$(find_repo)
if [ -z "$repo" ]; then
    echo "Can't find the repo. Put runTests.sh in the group-10 folder, next to frontend/ and backend/."
    exit 2
fi

failed=""
for person in $chosen; do
    for side in $sides; do
        if [ "$side" = frontend ]; then scope=$(frontend_scope "$person"); else scope=$(backend_scope "$person"); fi
        echo
        echo "=== $person: $side ==="
        if [ -z "$scope" ]; then
            echo "No $side tests on this branch yet."
            continue
        fi
        # $scope and $verbose are left unquoted on purpose: each fragment is its own argument.
        if ! (cd "$repo/$side" && npx vitest run $scope $verbose); then
            failed="$failed $person($side)"
        fi
    done
done

echo
if [ -n "$failed" ]; then
    echo "Failed:$failed"
    exit 1
fi
echo "All chosen tests passed."
