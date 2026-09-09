#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main()
{
    FILE *student_file;
    FILE *activity_file;
    FILE *results_file;
    char line[128];
    char *token;
    int student_ids[10];
    char last_names[10][24];
    char first_names[10][24];
    int activity_ids[10];
    int activity_grades[10];
    int grade01[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    int grade02[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    int student_count;
    int activity_count;
    int i;
    int j;
    double average;

    student_count = 0;
    student_file = fopen("class01_students.csv", "r");
    fgets(line, 128, student_file);

    while (fgets(line, 128, student_file) != NULL)
    {
        line[strcspn(line, "\n")] = '\0';
        token = strtok(line, ",");
        student_ids[student_count] = atoi(token);
        token = strtok(NULL, ",");
        strcpy(last_names[student_count], token);
        token = strtok(NULL, ",");
        strcpy(first_names[student_count], token);
        student_count = student_count + 1;
    }
    fclose(student_file);

    activity_count = 0;
    activity_file = fopen("class01_activity01.csv", "r");
    fgets(line, 128, activity_file);
    while (fgets(line, 128, activity_file) != NULL)
    {
        line[strcspn(line, "\n")] = '\0';
        token = strtok(line, ",");
        activity_ids[activity_count] = atoi(token);
        token = strtok(NULL, ",");
        activity_grades[activity_count] = atoi(token);
        activity_count = activity_count + 1;
    }
    fclose(activity_file);

    for (i = 0; i < student_count; i++)
    {
        for (j = 0; j < activity_count; j++)
        {
            if (student_ids[i] == activity_ids[j])
            {
                grade01[i] = activity_grades[j];
            }
        }
    }

    results_file = fopen("class01_results01.csv", "w");
    fprintf(results_file, "id,last_name,first_name,average,grade01\n");
    for (i = 0; i < student_count; i++)
    {
        average = grade01[i];
        fprintf(results_file, "%d,%s,%s,%.2f,%d\n",
                student_ids[i], last_names[i], first_names[i], average, grade01[i]);
    }
    fclose(results_file);

    /* Reopen the generated results file, as required when adding a new activity. */
    student_count = 0;
    results_file = fopen("class01_results01.csv", "r");
    fgets(line, 128, results_file);
    while (fgets(line, 128, results_file) != NULL)
    {
        line[strcspn(line, "\n")] = '\0';
        token = strtok(line, ",");
        student_ids[student_count] = atoi(token);
        token = strtok(NULL, ",");
        strcpy(last_names[student_count], token);
        token = strtok(NULL, ",");
        strcpy(first_names[student_count], token);
        token = strtok(NULL, ",");
        token = strtok(NULL, ",");
        grade01[student_count] = atoi(token);
        student_count = student_count + 1;
    }
    fclose(results_file);

    activity_count = 0;
    activity_file = fopen("class01_activity02.csv", "r");
    fgets(line, 128, activity_file);
    while (fgets(line, 128, activity_file) != NULL)
    {
        line[strcspn(line, "\n")] = '\0';
        token = strtok(line, ",");
        activity_ids[activity_count] = atoi(token);
        token = strtok(NULL, ",");
        activity_grades[activity_count] = atoi(token);
        activity_count = activity_count + 1;
    }
    fclose(activity_file);

    for (i = 0; i < student_count; i++)
    {
        for (j = 0; j < activity_count; j++)
        {
            if (student_ids[i] == activity_ids[j])
            {
                grade02[i] = activity_grades[j];
            }
        }
    }

    results_file = fopen("class01_results02.csv", "w");
    fprintf(results_file, "id,last_name,first_name,average,grade01,grade02\n");
    for (i = 0; i < student_count; i++)
    {
        average = (grade01[i] + grade02[i]) / 2.0;
        fprintf(results_file, "%d,%s,%s,%.2f,%d,%d\n",
                student_ids[i], last_names[i], first_names[i],
                average, grade01[i], grade02[i]);
    }
    fclose(results_file);

    /* Print the generated file so its contents can be checked in C-VIS. */
    results_file = fopen("class01_results02.csv", "r");
    while (fgets(line, 128, results_file) != NULL)
    {
        printf("%s", line);
    }
    fclose(results_file);

    return 0;
}
