#status: Approved
@FR-002
Feature: FR-002 Status with no job id lists jobs, and result with no job id shows the latest
  A session finds its Antigravity jobs without remembering their ids. Status with no job id lists
  the workspace's jobs newest first, and result with no job id reports the newest one.

  Every scenario starts with a job store of its own that holds no job, and every job runs on a
  stand-in engine, except in the subagent scenarios, which ask a live Claude Code subagent. Unless a
  scenario says otherwise, the workspace is a new git repository, and jobs are created one after
  another, each one second after the one before. Each job asks for a model no other job of the
  scenario asks for, so an entry's model belongs to its own job.

  Unless a scenario says otherwise, every job is created, and every reading is made, with the
  session's job store: the store the session names for the plugin. The default job store is the one
  the plugin uses when the session names none.

  A listing is read in both forms, readable and machine-readable, and every check on a listing or a
  result holds for both. A listing that shows jobs has also ended successfully. A task held running
  is a background task whose engine has started and confirmed its model and then writes nothing
  until it is released. The outside directory is a directory outside any git work tree.

  Rule: Status with no job id lists the workspace's jobs, newest first

    Scenario: Every job of the workspace is listed, newest first, with what identifies it
      Given these jobs were created in the workspace, oldest first: a task that succeeds verified, a task that succeeds unverified, a review that fails, a task that is cancelled, a task held running
      When the jobs are listed from the workspace
      Then the listing shows exactly the jobs created, newest first
      And every entry gives its job's id, leg, state, requested model and creation time
      And only a succeeded entry gives a verification, the one its job earned
      And no entry gives a directory

    Scenario: Status with no job id lists only the ten newest jobs
      Given twelve jobs were created in the workspace
      When the jobs are listed from the workspace
      Then the listing shows exactly the ten newest jobs created, newest first

  Rule: A listing reads only the job store the session selects

    Scenario Outline: A listing holds the jobs of the store the session selects, never a newer job of another store
      Given a job was created in the workspace, in <selected store>
      And a job was created in the workspace, in <other store>
      When the jobs are listed from the workspace, in <selected store>
      Then the listing shows exactly the jobs created in <selected store>, newest first

      Examples:
        | selected store           | other store              |
        | the session's job store  | the default job store    |
        | the default job store    | the session's job store  |

    Scenario Outline: Result with no job id reports the newest job of the store the session selects, never a newer job of another store
      Given a job was created in the workspace, in <selected store>
      And a job was created in the workspace, in <other store>
      When the latest result is read from the workspace, in <selected store>
      Then the latest result names the newest of the jobs created in <selected store>

      Examples:
        | selected store           | other store              |
        | the session's job store  | the default job store    |
        | the default job store    | the session's job store  |

  Rule: The order is by creation, never by later change

    Scenario: Jobs created at the same instant are listed by job id, highest first
      Given at least six jobs were created in the workspace at the same instant, the last of them not the one with the highest job id
      When the jobs are listed from the workspace
      Then the listing shows exactly the jobs created, newest first
      And every entry gives its job's id, leg, state, requested model and creation time

    Scenario: Of jobs created at the same instant, result with no job id reports the one with the highest job id
      Given at least six jobs were created in the workspace at the same instant, the last of them not the one with the highest job id
      When the latest result is read from the workspace
      Then the latest result names the newest of the jobs created in the workspace

    Scenario: An older job whose record changes after a newer job was created still lists after it
      Given these jobs were created in the workspace, oldest first: a task held running, a task that succeeds unverified
      When the held task is released and finishes
      And the jobs are listed from the workspace
      Then the listing shows exactly the jobs created, newest first

    Scenario: Result with no job id reports the newest job created, not the one changed most recently
      Given these jobs were created in the workspace, oldest first: a task held running, a task that succeeds unverified
      When the held task is released and finishes
      And the latest result is read from the workspace
      Then the latest result names the newest of the jobs created in the workspace

  Rule: The workspace is the repository, or the directory, the session runs in

    Scenario: From a subdirectory of a repository, the listing holds only that repository's jobs
      Given twelve jobs were created alternately in the first and the second repository
      When the jobs are listed from a subdirectory of the first repository
      Then the listing shows exactly the jobs created in the first repository, newest first

    Scenario: Across every workspace, the listing holds the ten newest jobs of the store, each with its directory
      Given twelve jobs were created alternately in the first and the second repository
      When the jobs of every workspace are listed from a subdirectory of the first repository
      Then the listing shows exactly the ten newest jobs created, newest first
      And every entry gives its job's directory

    Scenario: Outside any repository, a directory's listing holds its own and its subdirectories' jobs, never a sibling's that merely shares its name's start
      Given a job was created in the outside directory
      And a job was created in a subdirectory of the outside directory
      And a job was created in a sibling of the outside directory whose name begins with its name
      When the jobs are listed from the outside directory
      Then the listing shows exactly the jobs created in the outside directory and its subdirectory, newest first

    Scenario: Listing from a symbolic link to a directory lists what the directory itself lists
      Given a job was created in the outside directory
      And a job was created in a subdirectory of the outside directory
      And a job was created in a sibling of the outside directory whose name begins with its name
      When the jobs are listed from the outside directory
      And the jobs are listed from a symbolic link to the outside directory
      Then the listings from the outside directory and from the symbolic link to it are identical

    Scenario: A job whose directory has since become a symbolic link belongs to the directory the link points to
      Given a job was created in a directory beside the outside directory
      And that directory was then replaced by a symbolic link to the outside directory
      And a job was created in a sibling of the outside directory whose name begins with its name
      When the jobs are listed from the outside directory
      Then the listing shows exactly the jobs created in the directory now linked to the outside directory, newest first

    Scenario: Across every workspace, a job whose directory has since become a symbolic link gives the directory the link points to
      Given a job was created in a directory beside the outside directory
      And that directory was then replaced by a symbolic link to the outside directory
      When the jobs of every workspace are listed from the outside directory
      Then every entry gives its job's directory

    Scenario: A job whose directory no longer exists still belongs to the workspace that directory lay in, and to no other
      Given a job was created in a subdirectory of the outside directory
      And a job was created in a sibling of the outside directory whose name begins with its name
      When the directories those jobs were created in are removed
      And the jobs are listed from the outside directory
      Then the listing shows exactly the jobs created in the outside directory and its subdirectory, newest first

    Scenario: Result with no job id reports the newest job of its own workspace, never a newer one elsewhere
      Given a job was created in the first repository
      And a job was created in the second repository
      When the latest result is read from the first repository
      Then the latest result names the newest of the jobs created in the first repository

    Scenario: From the filesystem root, every job in the store belongs to the workspace
      Given a job was created in the first repository
      And a job was created in the outside directory
      And a job was created in a sibling of the outside directory whose name begins with its name
      When the jobs are listed from the filesystem root
      And the jobs of every workspace are listed from the filesystem root
      Then the listing from the filesystem root equals the listing of every workspace, without directories

  Rule: A workspace without jobs says so

    Scenario Outline: Status with no job id in a workspace without jobs says so and succeeds
      Given <other jobs>
      When the jobs are listed from the workspace
      Then the readable listing says the workspace has no agy jobs
      And the machine-readable listing is an empty list
      And the listing ends successfully

      Examples:
        | other jobs                                    |
        | the job store holds no job                    |
        | a job was created in the second repository    |

    Scenario Outline: Result with no job id in a workspace without jobs says so on its error stream and fails
      Given <other jobs>
      When the latest result is read from the workspace
      Then the latest result says on its error stream that the workspace has no agy jobs
      And the latest result prints nothing on its output
      And the latest result ends as a failure

      Examples:
        | other jobs                                    |
        | the job store holds no job                    |
        | a job was created in the second repository    |

  Rule: Result with no job id reports the newest job, whatever its state

    Scenario Outline: Result with no job id prints exactly what result prints for the newest job
      Given these jobs were created in the workspace, oldest first: a task that succeeds verified, <newer job>
      When the latest result is read from the workspace
      And the newest job's result is read by its id from the workspace
      Then the latest result is, byte for byte, the newest job's result read by its id, with the same exit status

      Examples:
        | newer job                  |
        | a task that fails          |
        | a review that succeeds     |
        | a task that is cancelled   |
        | a task held running        |

    Scenario Outline: An older succeeded job never takes precedence over a newer unfinished one
      Given these jobs were created in the workspace, oldest first: a task that succeeds verified, <newer job>
      When the latest result is read from the workspace
      Then the latest result reports the newest job as <state>

      Examples:
        | newer job                  | state                   |
        | a task held running        | running with no body    |
        | a task that is cancelled   | cancelled               |

  Rule: Cancel still needs a job id

    Scenario: Cancel with no job id is refused as a usage error that points to status
      Given these jobs were created in the workspace, oldest first: a task that succeeds unverified, a task held running
      When a cancel is asked for with no job id from the workspace
      Then the cancel is refused as a usage error
      And the cancel's error output says a job id is needed and names status as the way to list them

    Scenario: Cancel with no job id starts nothing and changes no job
      Given these jobs were created in the workspace, oldest first: a task that succeeds unverified, a task held running
      When a cancel is asked for with no job id from the workspace
      Then the cancel started no process
      And the job store is byte for byte as it was before the cancel
      And the held job's engine is still running

  Rule: Listing only reads

    Scenario Outline: A reading with no job id waits for no job, changes nothing and starts nothing but git
      Given these jobs were created in the workspace, oldest first: a task that succeeds unverified, a task held running
      When <reading>
      Then the reading returned within two seconds
      And the job store is byte for byte as it was before the reading
      And the held job's engine is still running
      And the reading started no process other than git

      Examples:
        | reading                                                    |
        | the jobs are listed from the workspace                     |
        | the jobs of every workspace are listed from the workspace  |
        | the latest result is read from the workspace               |

  Rule: Prompt text stays where FR-001 allows it

    Scenario Outline: No listing carries any part of a job's prompt
      Given every job's prompt carries a marker of its own, which the engine quotes back
      And these jobs were created in the workspace, oldest first: a task that succeeds verified, a review that succeeds, a task that fails, a task that is cancelled, a task held running
      When <listing>
      Then no listing carries any job's marker

      Examples:
        | listing                                                    |
        | the jobs are listed from the workspace                     |
        | the jobs of every workspace are listed from the workspace  |

    Scenario Outline: The latest result carries prompt text only inside a succeeded job's own response or findings
      Given every job's prompt carries a marker of its own, which the engine quotes back
      And these jobs were created in the workspace, oldest first: a task that succeeds unverified, <newest job>
      When the latest result is read from the workspace
      Then the latest result carries a job's marker only inside the engine's own response or findings of a succeeded job

      Examples:
        | newest job                     |
        | a task that succeeds verified  |
        | a review that succeeds         |
        | a task that fails              |
        | a review that fails            |
        | a task that is cancelled       |
        | a task held running            |

  Rule: A blank request to the subagent asks for the listing

    @live-subagent
    Scenario Outline: A blank request to the subagent reaches the runtime as status with no job id
      Given a job was created in the workspace
      When the subagent is given <request>
      Then the subagent made exactly one tool call, to the plugin runtime
      And the runtime was asked for status with no job id
      And the subagent's reply is the runtime's output, unchanged

      Examples:
        | request                         |
        | an empty request                |
        | a request of only whitespace    |
