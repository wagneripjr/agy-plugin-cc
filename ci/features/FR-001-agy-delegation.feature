#status: Draft
@FR-001
Feature: FR-001 Antigravity is a delegation target beside Codex
  A session hands a review or a task to Antigravity through one plugin and gets back a
  tracked, resumable, verifiable job.

  Every scenario that delegates gets its own new project: a git repository with one commit
  holding math.mjs, whose add(a, b) returns a - b on line 2 (the planted defect), a correct
  strings.mjs, and a README.md. Antigravity is the installed engine unless a scenario says
  otherwise.

  Rule: A review returns findings, never prose, and cannot write

    Scenario: A review returns Antigravity's own findings on the planted defect, leaves the project untouched and proves its turn
      Given a project with the planted defect
      When a review is delegated to Antigravity
      Then the review's findings are Antigravity's own structured output, with no prose in their place
      And the review's findings satisfy the shipped findings schema
      And the first finding points at the planted defect
      And every finding names a file, a line, a claim, the evidence checked and a verdict
      And the project is unchanged
      And the job reads succeeded, verified by the turn it ran in a new conversation

  Rule: A task may edit, and it reports what it did

    Scenario: A task fixes the planted defect, returns Antigravity's own final response and proves its turn
      Given a project with the planted defect
      When a task to fix the planted defect is delegated to Antigravity
      Then the planted defect is fixed
      And the result carries Antigravity's own final response and the conversation it ran in
      And the job reads succeeded, verified by the turn it ran in a new conversation
      And the conversation file is in Antigravity's conversation store and gained steps during the run

  Rule: Proof is tied to the invocation

    Scenario: A task whose conversation file vanished is reported unverified
      Given a project with the planted defect
      And Antigravity's conversation file will be removed once the engine exits
      When a task to fix the planted defect is delegated to Antigravity
      Then the job reads succeeded and unverified because the conversation file is missing

    Scenario: A follow-up whose turn never reached the conversation file is reported unverified
      Given a task job that ran in a project with the planted defect
      And Antigravity's conversation file will be put back to its state before the follow-up once the engine exits
      When a follow-up on that job is delegated to Antigravity
      Then the job reads succeeded and unverified because the marked step is absent

    Scenario: A follow-up whose conversation file holds its marked step but did not grow is reported unverified
      Given a task job that ran in a project with the planted defect
      And Antigravity's conversation file will be cut down to the follow-up's marked step once the engine exits
      When a follow-up on that job is delegated to Antigravity
      Then the job reads succeeded and unverified because the step count did not grow

  Rule: A job is resumable, and resuming is a choice

    Scenario: A follow-up remembers what the earlier turn was told
      Given a task job that was told a secret codeword and asked not to write it anywhere
      And the codeword appears nowhere in the project or its history
      When a follow-up on that job asks for the codeword
      Then the answer contains the codeword
      And the follow-up continued the earlier job's conversation
      And the engine was asked to continue the earlier job's conversation

    Scenario Outline: A run that does not resume starts a conversation of its own
      Given a task job that was told a secret codeword and asked not to write it anywhere
      And the codeword appears nowhere in the project or its history
      When a run that <resumes nothing> asks for the codeword in the same project
      Then the answer does not contain the codeword
      And the run's conversation is not the earlier job's
      And the engine was not asked to continue any conversation

      Examples:
        | resumes nothing            |
        | names no prior job         |
        | is explicitly marked fresh |

    Scenario: A follow-up on a job that never reached a conversation fails before starting the engine
      Given a job that ended before Antigravity reported a conversation
      When a follow-up on that job is delegated to Antigravity
      Then the job reads failed because there is no conversation to continue
      And no engine was started for the follow-up

  Rule: Background and foreground share one surface

    Scenario: A background run hands control back while the engine is still working
      Given a project with the planted defect
      And Antigravity will keep working until it is released
      When a task is delegated to Antigravity in the background
      Then the delegation returned while the engine was still working
      And the job's status reads running
      And the job's result reads running with no body

    Scenario: A background run's outcome is read by a later, separate reader
      Given a background task job whose engine is still working
      When the engine finishes its work
      Then a later status read shows the job succeeded
      And a later result read shows the job succeeded with Antigravity's own final response

    Scenario: A foreground run's record is read through the same commands
      Given a project with the planted defect
      And Antigravity will complete its work normally
      When a task is delegated to Antigravity in the foreground
      Then a later status read shows the job succeeded
      And a later result read shows the job succeeded with Antigravity's own final response

    Scenario: Reading a job never waits for the job
      Given a background task job whose engine is still working
      When the job's status and result are read
      Then each read finished on its own after printing

  Rule: Every run is a tracked job with one terminal state

    Scenario: A job that reported success is still running until its engine exits
      Given a project with the planted defect
      And Antigravity will report success and keep running until it is released
      When a task is delegated to Antigravity in the background
      Then the job's status reads running
      And the job's result reads running with no body

    Scenario: Cancelling a running job ends its engine
      Given a background task job whose engine is still working
      When the job is cancelled
      Then the engine is no longer running
      And the job reads cancelled because a cancel was requested
      And the result reads cancelled because a cancel was requested, with the requested engine settings and no response or findings

    Scenario Outline: Cancelling a finished job changes nothing
      Given a job that has already <finished>
      When the job is cancelled
      Then the cancel reports the job as <state>
      And the job's status and result read exactly as they did before the cancel

      Examples:
        | finished       | state     |
        | been cancelled | cancelled |
        | succeeded      | succeeded |
        | failed         | failed    |

    Scenario Outline: A run the engine did not complete cleanly reads failed with its reason
      Given a project with the planted defect
      And Antigravity will <misbehave>
      When a <leg> is delegated to Antigravity
      Then the job reads failed because <reason>
      And the result reads failed because <reason>, with the requested engine settings and no response or findings

      Examples:
        | misbehave                                     | leg    | reason                                                  |
        | exit before reporting a result                | task   | the engine exited without a result                      |
        | report a result that is not a success         | task   | the engine's result was not a success                   |
        | return findings that break the shipped schema | review | the findings broke the shipped schema                   |
        | exit with an error after reporting success    | task   | the engine exited with an error after reporting success |
        | run a different model than the one requested  | task   | the engine ran a different model than requested         |

    Scenario Outline: A run that goes wrong more than once keeps the first reason it showed
      Given a project with the planted defect
      And Antigravity will <misbehave>
      When a <leg> is delegated to Antigravity
      Then the job reads failed because <reason>
      And the result reads failed because <reason>, with the requested engine settings and no response or findings

      Examples:
        | misbehave                                                                 | leg    | reason                                |
        | return findings that break the shipped schema and then exit with an error | review | the findings broke the shipped schema |
        | report a result that is not a success and then exit with an error         | task   | the engine's result was not a success |

  Rule: A delegation names its engine settings and the engine confirms the model

    Scenario: A run on a model other than the one requested is stopped
      Given a project with the planted defect
      And Antigravity will run a different model than the one requested and keep working
      When a task is delegated to Antigravity
      Then the job reads failed with a reason naming both the requested model and the engine's model
      And the engine is no longer running

    Scenario Outline: A run that ends before the engine confirms its model keeps the settings it asked for
      Given a project with the planted defect
      And Antigravity <cannot confirm>
      When a task is delegated to Antigravity with an explicit model and effort
      Then the job reads failed because <reason>
      And the result reads failed because <reason>, with the requested engine settings and no response or findings
      And the result says no confirmation arrived from the engine

      Examples:
        | cannot confirm                        | reason                             |
        | is not installed                      | the engine could not start         |
        | will exit before confirming its model | the engine exited without a result |

    Scenario: A run the engine confirmed names the model the engine ran
      Given a project with the planted defect
      And Antigravity will complete its work normally
      When a task is delegated to Antigravity with an explicit model and effort
      Then the result names the model the engine reported
      And the engine was asked for exactly the model and effort the job requested
      And the result says the engine does not confirm the effort

    Scenario: A delegation that names no settings still names them to the engine
      Given a project with the planted defect
      And Antigravity will complete its work normally
      When a task is delegated to Antigravity
      Then the engine was asked for the plugin's documented default model and effort

  Rule: Two legs, chosen by mode, never sandboxed, and nothing added to the engine

    Scenario Outline: Every run asks the engine for streamed events, the job's settings and nothing else
      Given a project with the planted defect
      When <a run> is delegated to Antigravity
      Then the engine was asked to stream its events
      And the engine was given only the delegation's own options, nothing that adds a skill, plugin, MCP server, agent, project or directory
      And the engine was asked for exactly the model and effort the job requested
      And the result names the model the engine reported and says the engine does not confirm the effort

      Examples:
        | a run                          |
        | a review                       |
        | a task                         |
        | a follow-up on an earlier task |
        | a task in the background       |

    Scenario: A review runs the engine read-only with the shipped findings schema
      Given a project with the planted defect
      When a review is delegated to Antigravity
      Then the engine ran in plan mode with the shipped findings schema

    Scenario: A task runs the engine in its default mode, never sandboxed
      Given a project with the planted defect
      When a task is delegated to Antigravity
      Then the engine ran in neither plan mode nor a sandbox

  Rule: One engine process per job, and nothing left behind

    Scenario Outline: A job starts at most one engine and leaves nothing running once it ends
      Given a project with the planted defect
      When <a job> runs to its end
      Then the job started at most one engine
      And the engine had exited when the job first read finished
      And five seconds after the job first read finished, nothing the plugin started for the job is still running

      Examples:
        | a job                                                        |
        | a review                                                     |
        | a task                                                       |
        | a follow-up on an earlier task                               |
        | a task in the background                                     |
        | a task whose engine exits before reporting a result          |
        | a task whose engine runs a different model and keeps working |
        | a background task cancelled while its engine works           |

  Rule: A forwarding subagent forwards

    @static
    Scenario: The plugin ships exactly one subagent, and its only tool is the shell
      Given the plugin as shipped
      Then the plugin ships exactly one subagent
      And that subagent's only tool is the shell

    @static
    Scenario: The subagent presents itself as Antigravity, not Codex
      Given the plugin as shipped
      Then the subagent's description names Antigravity
      And the subagent's description does not name Codex

    Scenario Outline: The subagent forwards routing options and passes the rest as task text untouched
      Given a project with the planted defect
      And Antigravity will complete its work normally
      When the subagent is asked "<request>"
      Then the subagent made exactly one tool call, to the plugin runtime
      And the runtime's routing options were exactly: <routing>
      And the runtime received the task text "<task text>" byte for byte
      And the subagent's reply is the runtime's output, unchanged

      Examples:
        | request                                       | routing                    | task text                  |
        | --background fix the --fresh parser           | background                 | fix the --fresh parser     |
        | --resume J1 --effort low what did you change  | resume J1, effort low      | what did you change        |
        | --wait --model gemini-4-argon tidy the parser | wait, model gemini-4-argon | tidy the parser            |
        | --fresh --model --effort tidy the parser      | fresh, model --effort      | tidy the parser            |
        | --wait -- --fresh is a word here              | wait                       | --fresh is a word here     |
        | review --background now                       | none                       | review --background now    |
        | --verbose fix the parser                      | none                       | --verbose fix the parser   |
        | --fresh fix  the   parser,  twice             | fresh                      | fix  the   parser,  twice  |

  Rule: Skills and MCP are the engine's, and setup reports which ones are loaded

    Scenario: Setup on a machine without Antigravity says so and writes nothing
      Given Antigravity is not installed
      When setup runs
      Then setup reports that Antigravity is not installed
      And setup ends unsuccessfully
      And setup wrote nothing

    Scenario: Setup reports what the installed Antigravity offers
      Given Antigravity is installed
      When setup runs
      Then setup reports Antigravity's version, account state, models, plugins and MCP servers as Antigravity lists them

    Scenario: Setup only asks Antigravity about itself
      Given Antigravity is installed
      When setup runs
      Then the only Antigravity commands setup ran were its version, its models, its plugin list and its MCP server list

    Scenario: Setup reports an unusable account with Antigravity's own message
      Given Antigravity is installed but its account is unavailable
      When setup runs
      Then setup reports the account as unavailable with Antigravity's message

  Rule: The runtime rule is ADR-014's

    @static
    Scenario Outline: The runtime follows the zero-dependency Node rule
      Given the plugin as shipped
      Then the plugin ships a runtime
      And <the rule holds>

      Examples:
        | the rule holds                                                                                 |
        | every runtime file is a Node module                                                            |
        | the plugin declares no package dependency                                                      |
        | every process the runtime starts is an executable with an argument list, never through a shell |
        | no runtime file names a shell or passes a single command string                                |
        | no runtime file changes Antigravity's MCP servers or plugins                                   |
